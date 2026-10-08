import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { validate } from "../../middlewares/validate";
import { idParamSchema } from "../../utils/commonValidation";
import { sendResponse } from "../../utils/sendResponse";
import { adminController } from "./admin.controller";
import { auditLogsQuery, changeRoleSchema, changeStatusSchema, createUserSchema, listUsersQuery } from "./admin.validation";

const router = Router();

// Everything under /admin is ADMIN only.
router.use(authenticate, authorize(Role.ADMIN));

router.get("/ping", (req, res) => {
  sendResponse(res, { message: "Admin access granted", data: { userId: req.user!.id, role: req.user!.role } });
});

// User management
router.post("/users", validate({ body: createUserSchema }), adminController.createUser);
router.get("/users", validate({ query: listUsersQuery }), adminController.listUsers);
router.get("/users/:id", validate({ params: idParamSchema }), adminController.getUser);
router.patch("/users/:id/role", validate({ params: idParamSchema, body: changeRoleSchema }), adminController.changeRole);
router.patch("/users/:id/status", validate({ params: idParamSchema, body: changeStatusSchema }), adminController.changeStatus);
router.delete("/users/:id", validate({ params: idParamSchema }), adminController.removeUser);

// Dashboard + audit trail
router.get("/stats", adminController.stats);
router.get("/audit-logs", validate({ query: auditLogsQuery }), adminController.auditLogs);

export const adminRoutes = router;