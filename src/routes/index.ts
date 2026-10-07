import { Router } from "express";
import { sendResponse } from "../utils/sendResponse";

const router = Router();

router.get("/health", (_req, res) => {
  sendResponse(res, { message: "API is healthy", data: { uptime: process.uptime(), timestamp: new Date().toISOString() } });
});

export default router;