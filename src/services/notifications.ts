import axios from "axios";
import { config } from "../config/monitor";
import { SettingsService, SETTINGS_KEYS } from "./settings";
import { logger } from "../utils/logger";
import { MonitorTarget } from "../config/monitor";

export const sendDiscordNotification = async (
  target: MonitorTarget,
  status: "up" | "down"
) => {
  const discordWebhookUrl = await SettingsService.get(SETTINGS_KEYS.DISCORD_WEBHOOK_URL);
  if (!discordWebhookUrl) return;

  const color = status === "down" ? 15158332 : 3066993; // Red or Green
  const title = status === "down" ? "🔴 Service Down" : "🟢 Service Up";

  const embed = {
    title,
    description: `**${target.name}** is ${status.toUpperCase()}`,
    color,
    fields: [
      {
        name: "Target",
        value: target.host || target.url || "Unknown",
        inline: true,
      },
      {
        name: "Time",
        value: new Date().toISOString(),
        inline: true,
      },
    ],
  };

  try {
    await axios.post(discordWebhookUrl, {
      embeds: [embed],
    });
    logger.info(`Sent Discord notification for ${target.name}`);
  } catch (error) {
    logger.error("Failed to send Discord notification:", error);
  }
};
