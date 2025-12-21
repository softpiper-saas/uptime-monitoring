import express from "express";
import { env } from "../config/env";
import { requireAuth } from "../middleware/auth";
import { db } from "../db";
import { serviceStates } from "../db/schema";
import { eq } from "drizzle-orm";
import { reloadMonitors } from "../services/monitor";
import { SettingsService, SETTINGS_DEFINITIONS } from "../services/settings";

const router = express.Router();

// Login Page
router.get("/login", (req, res) => {
  res.render("login", { error: null });
});

// Login Action
router.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (username === env.ADMIN_USERNAME && password === env.ADMIN_PASSWORD) {
    // Set a simple cookie
    res.cookie("auth_token", "authenticated", { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }); // 1 day
    res.redirect("/admin/dashboard");
  } else {
    res.render("login", { error: "Invalid credentials" });
  }
});

// Logout
router.get("/logout", (req, res) => {
  res.clearCookie("auth_token");
  res.redirect("/admin/login");
});

// Dashboard
router.get("/dashboard", requireAuth, async (req, res) => {
  const services = await db.select().from(serviceStates);
  res.render("admin/dashboard", { services });
});

// Create Service Page
router.get("/services/new", requireAuth, (req, res) => {
  res.render("admin/edit", { service: null });
});

// Edit Service Page
router.get("/services/:id/edit", requireAuth, async (req, res) => {
  const service = await db.query.serviceStates.findFirst({
    where: eq(serviceStates.id, req.params.id),
  });
  
  if (!service) {
    return res.redirect("/admin/dashboard");
  }
  
  res.render("admin/edit", { service });
});

// Create/Update Action
router.post("/services/:id?", requireAuth, async (req, res) => {
  const id = req.params.id || `service-${Date.now()}`;
  const { 
    name, type, host, url, port, method, expectedStatusCode, 
    connectionString, database, username, password,
    accessKey, secretKey, bucket, prefix, maxBackupAgeHours
  } = req.body;

  const serviceData = {
    id,
    name,
    type,
    status: "down", // Default for new, will be updated by monitor
    lastChecked: new Date(),
    lastStatusChange: new Date(),
    consecutiveFailures: 0,
    totalChecks: 0,
    uptime: 100,
    
    // Config
    host: host || null,
    url: url || null,
    port: port ? parseInt(port) : null,
    method: method || "GET",
    expectedStatusCode: expectedStatusCode ? parseInt(expectedStatusCode) : 200,
    connectionString: connectionString || null,
    database: database || null,
    username: username || null,
    password: password || null,
    accessKey: accessKey || null,
    secretKey: secretKey || null,
    bucket: bucket || null,
    prefix: prefix || null,
    maxBackupAgeHours: maxBackupAgeHours ? parseInt(maxBackupAgeHours) : 24,
  };

  if (req.params.id) {
    // Update
    await db.update(serviceStates)
      .set({
        ...serviceData,
        // Don't reset status fields on update unless necessary
        status: undefined,
        lastChecked: undefined,
        lastStatusChange: undefined,
        consecutiveFailures: undefined,
        totalChecks: undefined,
        uptime: undefined,
      })
      .where(eq(serviceStates.id, id));
  } else {
    // Create
    await db.insert(serviceStates).values(serviceData);
  }

  // Trigger monitor reload
  await reloadMonitors();
  
  res.redirect("/admin/dashboard");
});

// Delete Action
router.post("/services/:id/delete", requireAuth, async (req, res) => {
  await db.delete(serviceStates).where(eq(serviceStates.id, req.params.id));
  
  // Trigger monitor reload
  await reloadMonitors();
  
  res.redirect("/admin/dashboard");
});
  


// Settings Page
router.get("/settings", requireAuth, async (req, res) => {
  const currentSettings = await SettingsService.getSettings();
  res.render("admin/settings", { 
    settings: SETTINGS_DEFINITIONS,
    values: currentSettings 
  });
});

// Update Settings
router.post("/settings", requireAuth, async (req, res) => {
  const newSettings = req.body;
  await SettingsService.updateAll(newSettings);
  
  // Reload monitors to pick up changes (like interval)
  await reloadMonitors();
  
  res.redirect("/admin/settings");
});

export default router;
