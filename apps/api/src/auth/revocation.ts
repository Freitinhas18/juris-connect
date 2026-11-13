import { Client } from "pg";
import type { FastifyBaseLogger } from "fastify";
import { sql } from "drizzle-orm";
import { db } from "../db/index.js";

const CHANNEL = "juris_connect_auth_revocations";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AuthRevocation = { type: "session"; id: string } | { type: "user"; id: string };

export async function publishAuthRevocation(event: AuthRevocation): Promise<void> {
  if (!UUID.test(event.id)) throw new Error("Invalid authentication revocation identifier");
  await db.execute(sql`select pg_notify(${CHANNEL}, ${JSON.stringify(event)})`);
}

function parseRevocation(payload: string | undefined): AuthRevocation | null {
  if (!payload || payload.length > 128) return null;
  try {
    const value: unknown = JSON.parse(payload);
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if ((record.type !== "session" && record.type !== "user") || typeof record.id !== "string" || !UUID.test(record.id)) return null;
    return { type: record.type, id: record.id };
  } catch { return null; }
}

export async function listenAuthRevocations(onRevocation: (event: AuthRevocation) => void, log: FastifyBaseLogger): Promise<() => Promise<void>> {
  let stopped = false;
  let subscriber: Client | undefined;
  let reconnectTimer: NodeJS.Timeout | undefined;
  let retryDelayMs = 1_000;

  const connect = async (): Promise<void> => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    client.on("notification", (notification) => {
      if (notification.channel !== CHANNEL) return;
      const event = parseRevocation(notification.payload);
      if (event) onRevocation(event);
    });
    client.on("error", (error) => log.error(error, "Auth revocation listener connection error"));
    client.on("end", () => {
      if (subscriber === client) {
        subscriber = undefined;
        scheduleReconnect();
      }
    });

    try {
      await client.connect();
      await client.query(`LISTEN ${CHANNEL}`);
      if (stopped) {
        await client.end();
        return;
      }
      subscriber = client;
      retryDelayMs = 1_000;
    } catch (error) {
      await client.end().catch(() => undefined);
      throw error;
    }
  };

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer) return;
    const delay = retryDelayMs;
    retryDelayMs = Math.min(retryDelayMs * 2, 30_000);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      void connect().catch((error: unknown) => {
        log.error(error, "Could not restore auth revocation listener");
        scheduleReconnect();
      });
    }, delay);
    reconnectTimer.unref();
  };

  try { await connect(); }
  catch (error) {
    stopped = true;
    await subscriber?.end().catch(() => undefined);
    throw error;
  }

  return async () => {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    const client = subscriber;
    subscriber = undefined;
    if (client) await client.end();
  };
}
