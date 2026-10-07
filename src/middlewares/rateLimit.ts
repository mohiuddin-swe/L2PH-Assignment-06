import rateLimit from "express-rate-limit";
import { isProd } from "../config/env";

const body = (message: string) => ({ success: false, message, errors: [] });

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: body("Too many requests, please try again later"),
});

// Tight limit on auth routes to slow down brute-force attempts.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isProd ? 20 : 200,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: body("Too many authentication attempts, please try again later"),
});