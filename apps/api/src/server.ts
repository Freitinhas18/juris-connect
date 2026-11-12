import Fastify from "fastify";
import { sql } from "drizzle-orm";
import { APP_NAME } from "@juris-connect/shared";
import { db } from "./db/index.js";

const app = Fastify({ logger: true });

app.get("/health", async () => ({ status: "ok", app: APP_NAME }));

app.get("/health/db", async () => {
  await db.execute(sql`select 1`);
  return { db: "ok" };
});

const port = Number(process.env.PORT ?? 3333);

try {
  await app.listen({ port, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}