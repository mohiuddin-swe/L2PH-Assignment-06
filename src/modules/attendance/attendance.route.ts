import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { validate } from "../../middlewares/validate";
import { idParamSchema } from "../../utils/commonValidation";
import { attendanceController } from "./attendance.controller";
import { markAttendanceSchema, myAttendanceQuery, offeringAttendanceQuery } from "./attendance.validation";

const router = Router();

router.use(authenticate);

// STUDENT: own attendance with percentage per offering
router.get("/my", authorize(Role.STUDENT), validate({ query: myAttendanceQuery }), attendanceController.mine);

// TEACHER (owner of the offering): bulk mark a class day
router.post("/", authorize(Role.TEACHER), validate({ body: markAttendanceSchema }), attendanceController.mark);

// TEACHER (owner) or ADMIN: view the records of an offering
router.get(
  "/offerings/:id",
  authorize(Role.TEACHER, Role.ADMIN),
  validate({ params: idParamSchema, query: offeringAttendanceQuery }),
  attendanceController.listByOffering,
);

export const attendanceRoutes = router;