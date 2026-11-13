import { sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { db } from "../db/index.js";
import type { AuthContext } from "./context.js";
import { hashOpaqueToken } from "./crypto.js";

export const SESSION_COOKIE = "juris_connect_session";
export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export function parseSessionCookie(cookie: string | undefined): string | null {
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === SESSION_COOKIE) {
      const token = value.join("=");
      return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
    }
  }
  return null;
}

export function readSessionCookie(request: FastifyRequest): string | null {
  return parseSessionCookie(request.headers.cookie);
}

export function sessionCookie(token: string, secure: boolean): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`;
}

export async function resolveSession(token: string): Promise<AuthContext | null> {
  const result = await db.execute(sql`SELECT * FROM resolve_juris_session(${hashOpaqueToken(token)})`);
  const row = result.rows[0] as { session_id: string; user_id: string; email: string; name: string; organization_id: string; role: AuthContext["role"] } | undefined;
  if (!row) return null;
  return { sessionId: row.session_id, userId: row.user_id, email: row.email, name: row.name, organizationId: row.organization_id, role: row.role };
}
