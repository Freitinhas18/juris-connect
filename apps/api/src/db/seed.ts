    import "dotenv/config";
import { db } from "./index.js";
import { channels, users } from "./schema.js";

const [user] = await db
  .insert(users)
  .values({ name: "Usuário de Teste", email: "teste@juris-connect.local" })
  .onConflictDoUpdate({
    target: users.email,
    set: { name: "Usuário de Teste" },
  })
  .returning();

await db.insert(channels).values({ name: "geral" }).onConflictDoNothing();

console.log("Seed concluído. userId de teste:", user.id);
process.exit(0);