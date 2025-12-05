import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().default("3000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DISCORD_WEBHOOK_URL: z.string().optional(),
  CHECK_INTERVAL_MINUTES: z.string().default("5"),
  PING_TIMEOUT_MS: z.string().default("5000"),
  HTTP_TIMEOUT_MS: z.string().default("10000"),
  DATABASE_TIMEOUT_MS: z.string().default("5000"),
  SSL_TIMEOUT_MS: z.string().default("10000"),
  BACKUP_TIMEOUT_MS: z.string().default("10000"),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("❌ Invalid environment variables:", parsedEnv.error.format());
  process.exit(1);
}

export const env = parsedEnv.data;
