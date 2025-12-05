import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import { env } from "./config/env";
import monitorRoutes from "./routes/monitor";
import { startMonitoring } from "./services/monitor";
import { logger } from "./utils/logger";
import { db } from "./db";
import { serviceStates } from "./db/schema";

const app = express();

// Middleware
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/monitor", monitorRoutes);

// Dashboard
app.get("/", async (req, res) => {
  try {
    const services = await db.select().from(serviceStates);
    const upCount = services.filter(s => s.status === "up").length;
    const downCount = services.filter(s => s.status === "down").length;
    const downServices = services.filter(s => s.status === "down");
    const totalUptime = services.reduce((acc, curr) => acc + curr.uptime, 0);
    const averageUptime = services.length > 0 ? totalUptime / services.length : 0;
    
    res.render("dashboard", {
      title: "Uptime Monitor Dashboard",
      status: {
        services,
        downServices,
        stats: {
          total: services.length,
          up: upCount,
          down: downCount,
          averageUptime,
        },
      },
      currentTime: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Error rendering dashboard:", error);
    res.status(500).send("Error loading dashboard");
  }
});

// Start
app.listen(env.PORT, () => {
  logger.info(`🚀 Uptime Monitor started on port ${env.PORT}`);
  startMonitoring();
});
