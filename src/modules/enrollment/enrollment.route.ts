import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { validate } from "../../middlewares/validate";
import { idParamSchema } from "../../utils/commonValidation";
import { enrollmentController } from "./enrollment.controller";
import { enrollSchema, myEnrollmentsQuery, offeringEnrollmentsQuery } from "./enrollment.validation";

// Mounted at /enrollments (STUDENT only)
const studentRouter = Router();
studentRouter.use(authenticate, authorize(Role.STUDENT));
studentRouter.get("/my", validate({ query: myEnrollmentsQuery }), enrollmentController.listMine);
studentRouter.post("/", validate({ body: enrollSchema }), enrollmentController.enroll);
studentRouter.post("/:id/drop", validate({ params: idParamSchema }), enrollmentController.drop);

// Mounted at /offerings/:id/enrollments (TEACHER who owns the offering, or ADMIN)
const offeringRouter = Router({ mergeParams: true });
offeringRouter.use(authenticate, authorize(Role.TEACHER, Role.ADMIN));
offeringRouter.get(
  "/",
  validate({ params: idParamSchema, query: offeringEnrollmentsQuery }),
  enrollmentController.listByOffering,
);

export const enrollmentRoutes = studentRouter;
export const offeringEnrollmentRoutes = offeringRouter;