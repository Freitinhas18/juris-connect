import assert from "node:assert/strict";
import { test } from "node:test";
import { createOpaqueToken, hashOpaqueToken, hashPassword, verifyPassword } from "../src/auth/crypto.js";

test("Auth crypto: password hashes use salts and verify without storing plaintext", async () => {
  const password = "Senha de teste forte 2026!";
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.match(first, /^scrypt\$32768\$8\$1\$/);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword("senha errada", first), false);
  assert.equal(await verifyPassword(password, "hash-invalido"), false);
  await assert.rejects(() => hashPassword("curta"), /12 e 128/);
});

test("Auth crypto: tokens opacos são aleatórios e armazenáveis apenas por hash", () => {
  const first = createOpaqueToken();
  const second = createOpaqueToken();
  assert.equal(first.length, 43);
  assert.notEqual(first, second);
  assert.notEqual(hashOpaqueToken(first), first);
  assert.equal(hashOpaqueToken(first), hashOpaqueToken(first));
});
