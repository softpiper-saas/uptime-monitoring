import { pgTable, text, timestamp, integer, real } from "drizzle-orm/pg-core";

export const serviceStates = pgTable("service_states", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(), // 'ping' | 'https' | 'ssl' | 'mysql' | etc.
  // Configuration fields
  host: text("host"),
  url: text("url"),
  port: integer("port"),
  method: text("method").default("GET"),
  timeout: integer("timeout").default(5000),
  expectedStatusCode: integer("expected_status_code").default(200),
  warningDays: integer("warning_days").default(30),
  criticalDays: integer("critical_days").default(7),
  accessKey: text("access_key"),
  secretKey: text("secret_key"),
  prefix: text("prefix"),
  bucket: text("bucket"),
  maxBackupAgeHours: integer("max_backup_age_hours"),
  database: text("database"),
  username: text("username"),
  password: text("password"),
  connectionString: text("connection_string"),
  
  // Status fields
  status: text("status").notNull(), // 'up' | 'down' | 'maintenance'
  lastChecked: timestamp("last_checked").notNull(),
  lastStatusChange: timestamp("last_status_change").notNull(),
  consecutiveFailures: integer("consecutive_failures").default(0).notNull(),
  totalChecks: integer("total_checks").default(0).notNull(),
  uptime: real("uptime").default(100.0).notNull(),
});
