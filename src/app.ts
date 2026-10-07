import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env";
import { AppError } from "./errors/AppError";
import { errorHandler } from "./middlewares/errorHandler";
import { notFound } from "./middlewares/notFound";
import { globalLimiter } from "./middlewares/rateLimit";
import routes from "./routes";

const app = express();

// Needed behind Render/Vercel proxies so rate limiting and secure cookies see the real client.
app.set("trust proxy", 1);

app.use(helmet());

const allowedOrigins = env.CORS_ORIGINS.split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    // Requests without an Origin header (Postman, curl, server-to-server) are allowed.
    origin: (origin, callback) =>
      !origin || allowedOrigins.includes(origin) ? callback(null, true) : callback(new AppError(403, "Not allowed by CORS")),
    credentials: true,
  }),
);

app.use(globalLimiter);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.use("/api/v1", routes);

app.use(notFound);
app.use(errorHandler);

export default app;