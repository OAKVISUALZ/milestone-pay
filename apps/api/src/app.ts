import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { projectsRouter } from "./routes/projects.js";
import { healthRouter } from "./routes/health.js";
import { openapiRouter } from "./routes/openapi.js";
import { refundsRouter } from "./routes/refunds.js";
import { createRateLimiter } from "./middleware/rateLimit.js";

export function createApp() {
  const app = express();

  const authRateLimiter = createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10,     // 10 requests per minute per IP
    message: "Too many authentication requests from this IP. Please wait before retrying.",
  });

  app.use(cors());
  // Enforce strict request body size limit to prevent memory exhaustion attacks
  app.use(express.json({ limit: "50kb" }));
  app.use(express.urlencoded({ extended: false, limit: "50kb" }));

  // Structured request logging
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV !== "test") {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    }
    next();
  });

  // Mount routes with rate limiting on sensitive auth endpoints
  app.use("/api/health", healthRouter);
  app.use("/api/auth", authRateLimiter, authRouter);
  app.use("/api/projects/:projectId/milestones/:milestoneId/refund", refundsRouter);
  app.use("/api/projects", projectsRouter);
  app.use("/api", openapiRouter);

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "Endpoint not found" });
  });

  // Global structured error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err?.type === "entity.too.large" || err?.status === 413 || err?.statusCode === 413) {
      res.status(413).json({
        error: "Payload Too Large",
        message: "Request body exceeds the 50kb size limit",
      });
      return;
    }

    console.error("[Unhandled Error]", err);
    res.status(500).json({
      error: "Internal server error",
      message: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  });

  return app;
}
