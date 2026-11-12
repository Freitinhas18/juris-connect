
import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "./index.js";

await migrate(db, { migrationsFolder: "./drizzle" });
console.log("Migrações aplicadas com sucesso");
process.exit(0);