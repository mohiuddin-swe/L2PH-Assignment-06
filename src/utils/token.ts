import crypto from "crypto";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import { env } from "../config/env";

export const signAccessToken = (userId: string, role: Role) =>
  jwt.sign({ role }, env.JWT_ACCESS_SECRET, {
    subject: userId,
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions["expiresIn"],
    algorithm: "HS256",
  });

export const verifyAccessToken = (token: string) => {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ["HS256"] }) as jwt.JwtPayload;
  return { sub: decoded.sub as string, role: decoded.role as Role };
};

// Refresh tokens are opaque random strings; only their SHA-256 hash is stored in the DB.
export const generateRefreshToken = () => crypto.randomBytes(48).toString("hex");
export const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");