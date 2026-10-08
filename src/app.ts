import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env";
import { AppError } from "./errors/AppError";
import { errorHandler } from "./middlewares/errorHandler";
import { notFound } from "./middlewares/notFound";
import { globalLimiter } from "./middlewares/rateLimit";
import { docsRoutes } from "./docs/docs.route";
import routes from "./routes";
import { paymentCallbackRoutes } from "./modules/payment/payment.route";

const app = express();

// Needed behind Render/Vercel proxies so rate limiting and secure cookies see the real client.
app.set("trust proxy", 1);
// Swagger UI is served before helmet: helmet's "upgrade-insecure-requests" CSP breaks http://localhost in Safari.
app.use("/api/v1/docs", docsRoutes);
app.use(helmet());
// Payment gateway callbacks arrive as form posts from the gateway's own domain, so they are mounted
// BEFORE the CORS check. They are safe because every callback is verified server-to-server.
app.use("/api/v1/payments/gateway", globalLimiter, express.urlencoded({ extended: false }), paymentCallbackRoutes);

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