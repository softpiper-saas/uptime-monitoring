import { pgTable, text, timestamp, integer, real } from "drizzle-orm/pg-core";

export const serviceStates = pgTable("service_states", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(), // 'ping' | 'https' | 'ssl' | 'mysql' | etc.
  status: text("status").notNull(), // 'up' | 'down' | 'maintenance'
  lastChecked: timestamp("last_checked").notNull(),
  lastStatusChange: timestamp("last_status_change").notNull(),
  consecutiveFailures: integer("consecutive_failures").default(0).notNull(),
  totalChecks: integer("total_checks").default(0).notNull(),
  uptime: real("uptime").default(100.0).notNull(),
});
