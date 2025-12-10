import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";

// Simple session-like behavior using cookies would require a library like express-session or cookie-parser
// For simplicity and "static login" requirement, we can use basic auth or a simple cookie check if we implement login flow.
// Since the user asked for a "static login page", let's implement a simple cookie-based auth without complex session store.

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  // Check for a simple auth cookie (in a real app, use signed cookies/sessions)
  // We'll assume a cookie named "auth_token" with a simple hash or just a flag for this MVP
  const authCookie = req.headers.cookie?.includes("auth_token=authenticated");

  if (authCookie) {
    return next();
  }

  res.redirect("/admin/login");
};
