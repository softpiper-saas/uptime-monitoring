import ping from "ping";
import axios from "axios";
import * as tls from "tls";
import mysql from "mysql2/promise";
import { Client as PgClient } from "pg";
import { MongoClient } from "mongodb";
import { createClient as createRedisClient } from "redis";
import { MonitorTarget } from "../config/monitor";
import { logger } from "../utils/logger";

/**
 * Result of a service check.
 */
export interface CheckResult {
  /** Status of the service: 'up' or 'down' */
  status: "up" | "down";
  /** Response time in milliseconds */
  latency?: number;
  /** Descriptive message about the check result */
  message?: string;
  /** Additional data specific to the check type (e.g. SSL info) */
  details?: any;
}

/**
 * Checks the availability of a host using ICMP ping.
 * 
 * @param target - The monitor target configuration.
 * @returns A promise that resolves to the check result.
 */
export const checkPing = async (target: MonitorTarget): Promise<CheckResult> => {
  try {
    const res = await ping.promise.probe(target.host!, {
      timeout: (target.timeout || 5000) / 1000,
    });
    return {
      status: res.alive ? "up" : "down",
      latency: res.time === "unknown" ? undefined : typeof res.time === 'number' ? res.time : parseFloat(res.time),
      message: res.alive ? "Ping successful" : "Ping failed",
    };
  } catch (error) {
    logger.error(`Ping check failed for ${target.name}:`, error);
    return { status: "down", message: "Ping check error" };
  }
};

/**
 * Checks the availability of an HTTP/HTTPS endpoint.
 * Validates the status code against the expected status code (default 200-299).
 * 
 * @param target - The monitor target configuration.
 * @returns A promise that resolves to the check result.
 */
export const checkHttp = async (target: MonitorTarget): Promise<CheckResult> => {
  const start = Date.now();
  try {
    await axios.request({
      url: target.url,
      method: target.method || "GET",
      timeout: target.timeout || 10000,
      validateStatus: (status) => {
        return target.expectedStatusCode ? status === target.expectedStatusCode : status >= 200 && status < 300;
      },
    });
    return {
      status: "up",
      latency: Date.now() - start,
      message: "HTTP check successful",
    };
  } catch (error) {
    logger.error(`HTTP check failed for ${target.name}:`, error);
    return { status: "down", message: "HTTP check failed" };
  }
};

/**
 * Checks the validity and expiry of an SSL certificate.
 * Connects to the host via TLS and inspects the peer certificate.
 * 
 * @param target - The monitor target configuration.
 * @returns A promise that resolves to the check result.
 */
export const checkSsl = async (target: MonitorTarget): Promise<CheckResult> => {
  const startTime = Date.now();
  const host = target.host!;
  const port = target.port || 443;
  const timeout = target.timeout || 10000;

  try {
    const certificateInfo = await new Promise<{
      validFrom: string;
      validTo: string;
      issuer: any;
      subject: any;
    }>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`SSL check timeout after ${timeout}ms`));
      }, timeout);

      const socket = tls.connect(
        port,
        host,
        {
          servername: host,
          rejectUnauthorized: false, // We want to check even invalid certificates to get info
        },
        () => {
          clearTimeout(timeoutId);
          const cert = socket.getPeerCertificate();

          if (!cert || Object.keys(cert).length === 0) {
            socket.destroy();
            reject(new Error("No certificate found"));
            return;
          }

          resolve({
            validFrom: cert.valid_from,
            validTo: cert.valid_to,
            issuer: cert.issuer,
            subject: cert.subject,
          });
          socket.destroy();
        }
      );

      socket.on("error", (err) => {
        clearTimeout(timeoutId);
        reject(err);
      });

      socket.on("timeout", () => {
        clearTimeout(timeoutId);
        socket.destroy();
        reject(new Error("Connection timeout"));
      });
    });

    const responseTime = Date.now() - startTime;
    const now = new Date();
    const validTo = new Date(certificateInfo.validTo);
    const daysUntilExpiry = Math.ceil(
      (validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    const warningDays = target.warningDays || 30;
    const criticalDays = target.criticalDays || 7;

    const isExpired = daysUntilExpiry <= 0;
    const isExpiringSoon = daysUntilExpiry <= warningDays;
    const isCritical = daysUntilExpiry <= criticalDays;

    let status: "up" | "down" = "up";
    let message = `SSL certificate valid for ${daysUntilExpiry} days`;

    if (isExpired) {
      status = "down";
      message = `SSL certificate expired ${Math.abs(daysUntilExpiry)} days ago`;
    } else if (isCritical) {
      message = `SSL certificate expires in ${daysUntilExpiry} days (CRITICAL)`;
    } else if (isExpiringSoon) {
      message = `SSL certificate expires in ${daysUntilExpiry} days (WARNING)`;
    }

    return {
      status,
      latency: responseTime,
      message,
      details: {
        validFrom: certificateInfo.validFrom,
        validTo: certificateInfo.validTo,
        daysUntilExpiry,
        issuer: certificateInfo.issuer,
        subject: certificateInfo.subject,
        isExpired,
        isExpiringSoon,
      },
    };
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    logger.error(`Error checking SSL certificate for ${host}:`, error);
    return {
      status: "down",
      latency: responseTime,
      message: error.message || "SSL check failed",
    };
  }
};

/**
 * Checks the connectivity of a database.
 * Supports MySQL, PostgreSQL, MongoDB, and Redis.
 * 
 * @param target - The monitor target configuration.
 * @returns A promise that resolves to the check result.
 */
export const checkDatabase = async (target: MonitorTarget): Promise<CheckResult> => {
  const startTime = Date.now();

  try {
    switch (target.type) {
      case "mysql":
        return await checkMySQL(target, startTime);
      case "postgres":
        return await checkPostgreSQL(target, startTime);
      case "mongodb":
        return await checkMongoDB(target, startTime);
      case "redis":
        return await checkRedis(target, startTime);
      default:
        return { status: "down", message: `Unsupported database type: ${target.type}` };
    }
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    logger.error(`Error checking database ${target.name}:`, error);
    return {
      status: "down",
      latency: responseTime,
      message: error.message || "Database check failed",
    };
  }
};

const checkMySQL = async (target: MonitorTarget, startTime: number): Promise<CheckResult> => {
  const connection = await mysql.createConnection({
    host: target.host,
    port: target.port,
    user: target.username,
    password: target.password,
    database: target.database,
    connectTimeout: target.timeout || 5000,
  });

  try {
    await connection.execute("SELECT 1");
    return {
      status: "up",
      latency: Date.now() - startTime,
      message: "MySQL check successful",
    };
  } finally {
    await connection.end();
  }
};

const checkPostgreSQL = async (target: MonitorTarget, startTime: number): Promise<CheckResult> => {
  const client = new PgClient({
    host: target.host,
    port: target.port,
    user: target.username,
    password: target.password,
    database: target.database,
    connectionTimeoutMillis: target.timeout || 5000,
  });

  try {
    await client.connect();
    await client.query("SELECT 1");
    return {
      status: "up",
      latency: Date.now() - startTime,
      message: "PostgreSQL check successful",
    };
  } finally {
    await client.end();
  }
};

const checkMongoDB = async (target: MonitorTarget, startTime: number): Promise<CheckResult> => {
  const client = new MongoClient(
    target.connectionString ||
      `mongodb://${target.host}:${target.port}/${target.database}`,
    {
      connectTimeoutMS: target.timeout || 5000,
      serverSelectionTimeoutMS: target.timeout || 5000,
    }
  );

  try {
    await client.connect();
    await client.db().admin().ping();
    return {
      status: "up",
      latency: Date.now() - startTime,
      message: "MongoDB check successful",
    };
  } finally {
    await client.close();
  }
};

const checkRedis = async (target: MonitorTarget, startTime: number): Promise<CheckResult> => {
  const client = createRedisClient({
    socket: {
      host: target.host,
      port: target.port,
      connectTimeout: target.timeout || 5000,
    },
    password: target.password || undefined,
  });

  try {
    await client.connect();
    await client.ping();
    return {
      status: "up",
      latency: Date.now() - startTime,
      message: "Redis check successful",
    };
  } finally {
    await client.disconnect();
  }
};

/**
 * Checks the status of a backup system by querying an API endpoint.
 * Verifies that backups exist and are recent enough.
 * 
 * @param target - The monitor target configuration.
 * @returns A promise that resolves to the check result.
 */
export const checkBackup = async (target: MonitorTarget): Promise<CheckResult> => {
  const startTime = Date.now();
  try {
    const response = await axios.get(target.url!, {
      headers: {
        access_key: target.access_key,
        secret_key: target.secret_key,
      },
      params: {
        prefix: target.prefix,
        bucket: target.bucket,
      },
      timeout: target.timeout || 10000,
    });

    const duration = Date.now() - startTime;
    const { data } = response;

    if (response.status !== 200 || data.status !== 200) {
      return {
        status: "down",
        latency: duration,
        message: `Error: Received status code ${response.status}`,
      };
    }

    if (!data.data || data.data.length === 0) {
      return {
        status: "down",
        latency: duration,
        message: "No backups found",
      };
    }

    const latestBackup = data.data[data.data.length - 1];
    // Assuming format: .../timestamp_filename... or similar logic from original code
    // Original code: const timestamp = parseInt(latestBackup.split("/")[1].split("_")[0]);
    // We'll trust the original logic here.
    const timestamp = parseInt(latestBackup.split("/")[1].split("_")[0]);
    const backupTime = new Date(timestamp * 1000);
    const now = new Date();
    const timeDiff = now.getTime() - backupTime.getTime();
    const timeDiffHours = timeDiff / (1000 * 60 * 60);

    if (target.maxBackupAgeHours && timeDiffHours > target.maxBackupAgeHours) {
      return {
        status: "down",
        latency: duration,
        message: `Latest backup is too old (${Math.round(timeDiffHours)} hours)`,
      };
    }

    return {
      status: "up",
      latency: duration,
      message: `Total backups: ${data.data.length}, Last backup: ${backupTime.toLocaleString()}`,
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error(`Error checking backup ${target.name}:`, error);
    return {
      status: "down",
      latency: duration,
      message: error.message || "Backup check failed",
    };
  }
};
