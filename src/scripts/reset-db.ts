import { db } from "../db";
import { sql } from "drizzle-orm";

const reset = async () => {
  try {
    console.log("Dropping table service_states...");
    await db.execute(sql`DROP TABLE IF EXISTS service_states`);
    console.log("Table dropped.");
    process.exit(0);
  } catch (error) {
    console.error("Error dropping table:", error);
    process.exit(1);
  }
};

reset();
