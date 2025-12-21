import { db } from "../db";
import { settings } from "../db/schema";
import { eq } from "drizzle-orm";
import { env } from "../config/env";

export const SETTINGS_KEYS = {
  DISCORD_WEBHOOK_URL: "discordWebhookUrl",
  CHECK_INTERVAL_MINUTES: "checkIntervalMinutes",
  PING_TIMEOUT_MS: "pingTimeout",
  HTTP_TIMEOUT_MS: "httpTimeout",
  DATABASE_TIMEOUT_MS: "databaseTimeout",
  SSL_TIMEOUT_MS: "sslTimeout",
  BACKUP_TIMEOUT_MS: "backupTimeout",
} as const;

export type SettingsKey = (typeof SETTINGS_KEYS)[keyof typeof SETTINGS_KEYS];

export interface SettingDefinition {
  key: SettingsKey;
  label: string;
  type: "text" | "number" | "password";
  defaultValue: string;
  description?: string;
}

export const SETTINGS_DEFINITIONS: SettingDefinition[] = [
  {
    key: SETTINGS_KEYS.DISCORD_WEBHOOK_URL,
    label: "Discord Webhook URL",
    type: "password",
    defaultValue: env.DISCORD_WEBHOOK_URL || "",
    description: "URL for Discord notifications",
  },
  {
    key: SETTINGS_KEYS.CHECK_INTERVAL_MINUTES,
    label: "Check Interval (Minutes)",
    type: "number",
    defaultValue: env.CHECK_INTERVAL_MINUTES,
    description: "How often to run checks",
  },
  {
    key: SETTINGS_KEYS.PING_TIMEOUT_MS,
    label: "Ping Timeout (ms)",
    type: "number",
    defaultValue: env.PING_TIMEOUT_MS,
  },
  {
    key: SETTINGS_KEYS.HTTP_TIMEOUT_MS,
    label: "HTTP Timeout (ms)",
    type: "number",
    defaultValue: env.HTTP_TIMEOUT_MS,
  },
  {
    key: SETTINGS_KEYS.DATABASE_TIMEOUT_MS,
    label: "Database Timeout (ms)",
    type: "number",
    defaultValue: env.DATABASE_TIMEOUT_MS,
  },
  {
    key: SETTINGS_KEYS.SSL_TIMEOUT_MS,
    label: "SSL Timeout (ms)",
    type: "number",
    defaultValue: env.SSL_TIMEOUT_MS,
  },
  {
    key: SETTINGS_KEYS.BACKUP_TIMEOUT_MS,
    label: "Backup Timeout (ms)",
    type: "number",
    defaultValue: env.BACKUP_TIMEOUT_MS,
  },
];

export class SettingsService {
  static async getSettings(): Promise<Record<SettingsKey, string>> {
    const allSettings = await db.select().from(settings);
    const settingsMap: Record<string, string> = {};

    // Populate with defaults first
    for (const def of SETTINGS_DEFINITIONS) {
      settingsMap[def.key] = def.defaultValue;
    }

    // Override with DB values
    for (const setting of allSettings) {
      if (setting.value) {
        settingsMap[setting.key] = setting.value;
      }
    }

    return settingsMap as Record<SettingsKey, string>;
  }

  static async get(key: SettingsKey): Promise<string> {
    const setting = await db.query.settings.findFirst({
      where: eq(settings.key, key),
    });

    if (setting && setting.value) {
      return setting.value;
    }

    const def = SETTINGS_DEFINITIONS.find((d) => d.key === key);
    return def ? def.defaultValue : "";
  }

  static async set(key: SettingsKey, value: string): Promise<void> {
    const existing = await db.query.settings.findFirst({
      where: eq(settings.key, key),
    });

    if (existing) {
      await db.update(settings).set({ value }).where(eq(settings.key, key));
    } else {
      await db.insert(settings).values({ key, value });
    }
  }

  static async updateAll(newSettings: Record<string, string>): Promise<void> {
    for (const [key, value] of Object.entries(newSettings)) {
      // Validate key exists in definitions
      if (Object.values(SETTINGS_KEYS).includes(key as SettingsKey)) {
        await this.set(key as SettingsKey, value);
      }
    }
  }
}
