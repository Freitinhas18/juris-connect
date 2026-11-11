import Fastify from "fastify";
import { APP_NAME } from "@juris-connect/shared";

const app = Fastify({ logger: true });

app.get("/health", async () => ({ status: "ok", app: APP_NAME }));

const port = Number(process.env.PORT ?? 3333);

try {
  await app.listen({ port, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}