import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { join, resolve, sep } from "node:path";
import { sql } from "drizzle-orm";
import { documents } from "../db/schema.js";
import { db } from "../db/index.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENCRYPTED_FILE_MAGIC = Buffer.from([0x4a, 0x43, 0x44, 0x4f, 0x43, 0x01, 0x00, 0xff]);
const NONCE_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const storageRoot = resolve(process.env.DOCUMENT_STORAGE_PATH || ".data/documents");
function filePath(id: string, suffix = ""): string {
  if (!UUID.test(id)) throw new Error("Invalid internal file identifier");
  const target = resolve(storageRoot, `${id}${suffix}`);
  if (!target.startsWith(storageRoot + sep)) throw new Error("Invalid internal file path");
  return target;
}
export function documentEncryptionKey(): Buffer {
  const encoded = process.env.DOCUMENT_ENCRYPTION_KEY;
  if (!encoded) throw new Error("DOCUMENT_ENCRYPTION_KEY deve ser configurada para armazenar documentos.");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64") !== encoded) throw new Error("DOCUMENT_ENCRYPTION_KEY deve ser Base64 canônico de exatamente 32 bytes.");
  return key;
}
export async function ensureStorage() { await mkdir(storageRoot, { recursive: true }); }
export async function writeStaged(id: string, data: Buffer) {
  const key = documentEncryptionKey();
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(id, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  const encrypted = Buffer.concat([ENCRYPTED_FILE_MAGIC, nonce, cipher.getAuthTag(), ciphertext]);
  await ensureStorage();
  await writeFile(filePath(id, ".upload"), encrypted, { flag: "wx", mode: 0o600 });
}
export async function promoteStaged(id: string) { await rename(filePath(id, ".upload"), filePath(id)); }
export async function removeStaged(id: string) { await rm(filePath(id, ".upload"), { force: true }); }
export async function removeFinal(id: string) { await rm(filePath(id), { force: true }); }
export async function quarantine(id: string) { await rename(filePath(id), filePath(id, ".deleted")); }
export async function restoreQuarantine(id: string) { await rename(filePath(id, ".deleted"), filePath(id)); }
export async function removeQuarantine(id: string) { await rm(filePath(id, ".deleted"), { force: true }); }
export async function openStoredFile(id: string) { const target = filePath(id); await stat(target); return target; }
export async function readStoredFile(id: string) {
  const stored = await readFile(filePath(id));
  if (!stored.subarray(0, ENCRYPTED_FILE_MAGIC.length).equals(ENCRYPTED_FILE_MAGIC)) return stored; // Existing files stay readable until an explicit migration.
  const minimumSize = ENCRYPTED_FILE_MAGIC.length + NONCE_BYTES + AUTH_TAG_BYTES;
  if (stored.length < minimumSize) throw new Error("Encrypted document is truncated.");
  const key = documentEncryptionKey();
  const nonceStart = ENCRYPTED_FILE_MAGIC.length;
  const tagStart = nonceStart + NONCE_BYTES;
  const ciphertextStart = tagStart + AUTH_TAG_BYTES;
  const decipher = createDecipheriv("aes-256-gcm", key, stored.subarray(nonceStart, tagStart));
  decipher.setAAD(Buffer.from(id, "utf8"));
  decipher.setAuthTag(stored.subarray(tagStart, ciphertextStart));
  return Buffer.concat([decipher.update(stored.subarray(ciphertextStart)), decipher.final()]);
}

// Reconcile only UUID files created by this module, never unrelated files.
export async function reconcileStorage() {
  const privilege = await db.execute(sql`SELECT r.rolsuper OR r.rolbypassrls OR EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'documents' AND pg_has_role(current_user, c.relowner, 'USAGE')
  ) AS can_reconcile FROM pg_roles r WHERE r.rolname = current_user`);
  if (!(privilege.rows[0] as { can_reconcile?: boolean } | undefined)?.can_reconcile) return false;
  await ensureStorage();
  const rows = await db.select({ id: documents.id }).from(documents);
  const known = new Set(rows.map((row) => row.id.toLowerCase()));
  for (const name of await readdir(storageRoot)) {
    const match = name.match(/^([0-9a-f-]{36})(\.upload|\.deleted)?$/i);
    if (!match || !UUID.test(match[1])) continue;
    const id = match[1]; const suffix = match[2] ?? "";
    if (suffix === ".upload") { await rm(filePath(id, suffix), { force: true }); continue; }
    if (suffix === ".deleted") {
      if (known.has(id.toLowerCase())) await rename(filePath(id, suffix), filePath(id));
      else await rm(filePath(id, suffix), { force: true });
      continue;
    }
    if (!known.has(id.toLowerCase())) await rename(filePath(id), filePath(id, ".orphan")).catch(() => undefined);
  }
  return true;
}
