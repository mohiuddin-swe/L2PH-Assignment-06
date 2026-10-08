import { Router } from "express";
import { authLimiter } from "../middlewares/rateLimit";
import { adminRoutes } from "../modules/admin/admin.route";
import { authRoutes } from "../modules/auth/auth.route";
import { courseRoutes } from "../modules/course/course.route";
import { departmentRoutes } from "../modules/department/department.route";
import { enrollmentRoutes, offeringEnrollmentRoutes } from "../modules/enrollment/enrollment.route";
import { offeringRoutes } from "../modules/offering/offering.route";
import { userRoutes } from "../modules/user/user.route";
import { sendResponse } from "../utils/sendResponse";

const router = Router();

router.get("/health", (_req, res) => {
  sendResponse(res, { message: "API is healthy", data: { uptime: process.uptime(), timestamp: new Date().toISOString() } });
});

router.use("/auth", authLimiter, authRoutes);
router.use("/users", userRoutes);
router.use("/departments", departmentRoutes);
router.use("/courses", courseRoutes);
// Declared before /offerings so that /offerings/:id/enrollments reaches the enrollment router
router.use("/offerings/:id/enrollments", offeringEnrollmentRoutes);
router.use("/offerings", offeringRoutes);
router.use("/enrollments", enrollmentRoutes);
router.use("/admin", adminRoutes);

export default router;