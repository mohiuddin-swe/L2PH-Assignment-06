import { Router } from "express";
import { authLimiter } from "../middlewares/rateLimit";
import { adminRoutes } from "../modules/admin/admin.route";
import { authRoutes } from "../modules/auth/auth.route";
import { userRoutes } from "../modules/user/user.route";
import { sendResponse } from "../utils/sendResponse";

const router = Router();

router.get("/health", (_req, res) => {
  sendResponse(res, { message: "API is healthy", data: { uptime: process.uptime(), timestamp: new Date().toISOString() } });
});

router.use("/auth", authLimiter, authRoutes);
router.use("/users", userRoutes);
router.use("/admin", adminRoutes);

export default router;