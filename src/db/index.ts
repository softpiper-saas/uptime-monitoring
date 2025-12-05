import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import * as schema from "./schema";
import { env } from "../config/env";

// Force disable SSL verification for self-signed certs
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const client = new Client({
  connectionString: env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

const connectDB = async () => {
  try {
    await client.connect();
    console.log("Connected to PostgreSQL database");
  } catch (error) {
    console.error("Failed to connect to database:", error);
    process.exit(1);
  }
};

connectDB();

export const db = drizzle(client, { schema });
