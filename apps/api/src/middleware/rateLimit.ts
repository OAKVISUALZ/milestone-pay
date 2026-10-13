import { Request, Response, NextFunction } from "express";

interface RateLimitRecord {
  timestamps: number[];
}

/**
 * In-memory sliding window rate limiter for sensitive authentication endpoints.
 *
 * NOTE: This application-level rate limiting mitigates basic scripted brute-force
 * and credential stuffing attempts. It does NOT provide comprehensive DDoS protection
 * against volumetric network attacks or distributed botnets, which requires edge-level
 * protection (e.g. Cloudflare, AWS Shield, reverse proxy filters).
 */
export function createRateLimiter(options: {
  windowMs: number;
  maxRequests: number;
  message?: string;
}) {
  const { windowMs, maxRequests, message = "Too many requests. Please try again later." } = options;
  const store = new Map<string, RateLimitRecord>();

  // Periodic cleanup of stale entries every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of store.entries()) {
      record.timestamps = record.timestamps.filter((t) => now - t < windowMs);
      if (record.timestamps.length === 0) {
        store.delete(key);
      }
    }
  }, 300_000).unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      "unknown";

    const now = Date.now();
    let record = store.get(ip);
    if (!record) {
      record = { timestamps: [] };
      store.set(ip, record);
    }

    // Filter out timestamps outside the sliding window
    record.timestamps = record.timestamps.filter((t) => now - t < windowMs);

    if (record.timestamps.length >= maxRequests) {
      const oldest = record.timestamps[0];
      const resetTime = Math.ceil((oldest + windowMs - now) / 1000);
      res.setHeader("Retry-After", resetTime.toString());
      res.status(429).json({
        error: "Too Many Requests",
        message,
        retryAfterSeconds: resetTime,
      });
      return;
    }

    record.timestamps.push(now);
    next();
  };
}

export const authRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10,     // 10 requests per minute
  message: "Too many authentication requests from this IP. Please wait before retrying.",
});
