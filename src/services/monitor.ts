import cron from "node-cron";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { serviceStates } from "../db/schema";
import { config, MonitorTarget } from "../config/monitor";
import { checkPing, checkHttp, checkSsl, checkDatabase, checkBackup, CheckResult } from "./checkers";
import { sendDiscordNotification } from "./notifications";
import { logger } from "../utils/logger";

const getChecker = (type: MonitorTarget["type"]) => {
  switch (type) {
    case "ping": return checkPing;
    case "https": return checkHttp;
    case "ssl": return checkSsl;
    case "mysql":
    case "postgres":
    case "mongodb":
    case "redis": return checkDatabase;
    case "backup": return checkBackup;
    default: return async () => ({ status: "down", message: "Unknown check type" } as CheckResult);
  }
};

export const checkService = async (target: MonitorTarget) => {
  const check = getChecker(target.type);
  const result = await check(target);
  
  // Update state in DB
  const now = new Date();
  let state = await db.query.serviceStates.findFirst({
    where: eq(serviceStates.id, target.id),
  });

  if (!state) {
    // Initialize state
    await db.insert(serviceStates).values({
      id: target.id,
      name: target.name,
      type: target.type,
      status: result.status,
      lastChecked: now,
      lastStatusChange: now,
      consecutiveFailures: result.status === "down" ? 1 : 0,
      totalChecks: 1,
      uptime: result.status === "up" ? 100 : 0,
    });
    return;
  }

  // Update existing state
  const wasDown = state.status === "down";
  const isDown = result.status === "down";
  const statusChanged = wasDown !== isDown;

  let consecutiveFailures = state.consecutiveFailures;
  let lastStatusChange = state.lastStatusChange;

  if (statusChanged) {
    lastStatusChange = now;
    consecutiveFailures = isDown ? 1 : 0;
    // Send notification
    await sendDiscordNotification(target, result.status);
  } else if (isDown) {
    consecutiveFailures++;
  } else {
    consecutiveFailures = 0;
  }

  const totalChecks = state.totalChecks + 1;
  // Calculate uptime (simplified for now, ideally should be based on history)
  // OOP version used: (upChecks / totalChecks) * 100
  // We need to track upChecks. Since we don't have it explicitly in schema (my bad in plan), 
  // we can derive it or add it. For now let's approximate or use what we have.
  // Wait, I can't easily derive it without history. 
  // Let's just update the schema to include `upChecks` or just calculate incrementally.
  // New uptime = ((Old Uptime * Old Total) + (Current is Up ? 100 : 0)) / New Total
  
  const currentScore = result.status === "up" ? 100 : 0;
  const newUptime = ((state.uptime * state.totalChecks) + currentScore) / totalChecks;

  await db.update(serviceStates)
    .set({
      status: result.status,
      lastChecked: now,
      lastStatusChange,
      consecutiveFailures,
      totalChecks,
      uptime: newUptime,
    })
    .where(eq(serviceStates.id, target.id));
};

let monitorInterval: NodeJS.Timeout | null = null;

export const startMonitoring = async () => {
  await reloadMonitors();
};

export const reloadMonitors = async () => {
  // Stop existing interval
  if (monitorInterval) {
    clearInterval(monitorInterval);
  }

  // Fetch targets from DB
  const services = await db.select().from(serviceStates);
  
  // Map DB records to MonitorTarget
  const targets: MonitorTarget[] = services.map(s => ({
    id: s.id,
    name: s.name,
    type: s.type as any, // Cast to specific type union
    host: s.host || undefined,
    url: s.url || undefined,
    port: s.port || undefined,
    method: s.method || undefined,
    expectedStatusCode: s.expectedStatusCode || undefined,
    warningDays: s.warningDays || undefined,
    criticalDays: s.criticalDays || undefined,
    access_key: s.accessKey || undefined,
    secret_key: s.secretKey || undefined,
    prefix: s.prefix || undefined,
    bucket: s.bucket || undefined,
    maxBackupAgeHours: s.maxBackupAgeHours || undefined,
    database: s.database || undefined,
    username: s.username || undefined,
    password: s.password || undefined,
    connectionString: s.connectionString || undefined,
    timeout: s.timeout || 5000,
  }));

  logger.info(`Starting monitoring for ${targets.length} targets from DB...`);

  // Run immediately
  targets.forEach(checkService);

  // Schedule
  monitorInterval = setInterval(() => {
    logger.info("Running scheduled checks...");
    targets.forEach(checkService);
  }, config.checkIntervalMinutes * 60 * 1000);
};
