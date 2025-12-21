import { SettingsService, SETTINGS_KEYS } from "../services/settings";
import { db } from "../db";
import { settings } from "../db/schema";
import { sql } from "drizzle-orm";

const verify = async () => {
  try {
    console.log("Starting Settings Verification...");

    // 1. Test Default Values
    console.log("Testing default values...");
    const defaults = await SettingsService.getSettings();
    console.log("Defaults:", defaults);
    
    if (defaults[SETTINGS_KEYS.CHECK_INTERVAL_MINUTES] !== "5") {
      throw new Error("Default CHECK_INTERVAL_MINUTES should be 5");
    }

    // 2. Test Update
    console.log("Testing update...");
    await SettingsService.set(SETTINGS_KEYS.CHECK_INTERVAL_MINUTES, "10");
    const updated = await SettingsService.get(SETTINGS_KEYS.CHECK_INTERVAL_MINUTES);
    console.log("Updated value:", updated);

    if (updated !== "10") {
      throw new Error("Failed to update CHECK_INTERVAL_MINUTES");
    }

    // 3. Test Update All
    console.log("Testing updateAll...");
    await SettingsService.updateAll({
      [SETTINGS_KEYS.PING_TIMEOUT_MS]: "2000",
      [SETTINGS_KEYS.HTTP_TIMEOUT_MS]: "3000",
    });
    
    const newSettings = await SettingsService.getSettings();
    console.log("New Settings:", newSettings);

    if (newSettings[SETTINGS_KEYS.PING_TIMEOUT_MS] !== "2000") {
      throw new Error("Failed to update PING_TIMEOUT_MS");
    }

    console.log("✅ Verification Successful!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Verification Failed:", error);
    process.exit(1);
  }
};

verify();
