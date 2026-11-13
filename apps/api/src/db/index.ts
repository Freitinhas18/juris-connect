import "dotenv/config";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";
import { installTenantContext } from "./tenant-context.js";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL! });
installTenantContext(pool);

export const db = drizzle(pool, { schema });
