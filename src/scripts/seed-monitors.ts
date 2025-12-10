import { db } from "../db";
import { serviceStates } from "../db/schema";
import { config } from "../config/monitor";
import { logger } from "../utils/logger";

const seed = async () => {
  try {
    const targets = [
      ...config.servers,
      ...config.applications,
      ...config.databases,
      ...config.sslCertificates,
      ...config.backups,
    ];

    logger.info(`Seeding ${targets.length} monitors...`);

    for (const target of targets) {
      await db.insert(serviceStates).values({
        id: target.id,
        name: target.name,
        type: target.type,
        status: "down", // Default status
        lastChecked: new Date(),
        lastStatusChange: new Date(),
        consecutiveFailures: 0,
        totalChecks: 0,
        uptime: 100,
        
        // Config fields
        host: target.host,
        url: target.url,
        port: target.port,
        method: target.method,
        timeout: target.timeout,
        expectedStatusCode: target.expectedStatusCode,
        warningDays: target.warningDays,
        criticalDays: target.criticalDays,
        accessKey: target.access_key,
        secretKey: target.secret_key,
        prefix: target.prefix,
        bucket: target.bucket,
        maxBackupAgeHours: target.maxBackupAgeHours,
        database: target.database,
        username: target.username,
        password: target.password,
        connectionString: target.connectionString,
      }).onConflictDoNothing();
    }

    logger.info("Seeding completed successfully.");
    process.exit(0);
  } catch (error) {
    logger.error("Error seeding monitors:", error);
    process.exit(1);
  }
};

seed();
