import { Router } from "express";
import { db } from "../db";
import { serviceStates } from "../db/schema";
import { config } from "../config/monitor";
import { checkService } from "../services/monitor";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/status", async (req, res) => {
  try {
    const services = await db.select().from(serviceStates);
    res.json(services);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch status" });
  }
});

router.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

router.post("/check", async (req, res) => {
  // Trigger manual check for all
  const targets = [
    ...config.servers,
    ...config.applications,
    ...config.databases,
    ...config.sslCertificates,
    ...config.backups,
  ];
  
  // Run in background
  targets.forEach(checkService);
  
  res.json({ message: "Manual check triggered" });
});

export default router;
