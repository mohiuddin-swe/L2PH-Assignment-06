import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { sendResponse } from "../../utils/sendResponse";

const router = Router();

router.use(authenticate, authorize(Role.ADMIN));

// Temporary route to demonstrate role-based authorization. Real admin endpoints come in a later sprint.
router.get("/ping", (req, res) => {
  sendResponse(res, { message: "Admin access granted", data: { userId: req.user!.id, role: req.user!.role } });
});

export const adminRoutes = router;