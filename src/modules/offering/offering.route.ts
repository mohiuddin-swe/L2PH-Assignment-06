import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { validate } from "../../middlewares/validate";
import { idParamSchema } from "../../utils/commonValidation";
import { offeringController } from "./offering.controller";
import {
  assignTeacherSchema,
  createOfferingSchema,
  listOfferingsQuery,
  myAssignedQuery,
  updateCapacitySchema,
} from "./offering.validation";

const router = Router();

router.use(authenticate);

// TEACHER: must be declared before "/:id" so "my-assigned" is not treated as an id
router.get("/my-assigned", authorize(Role.TEACHER), validate({ query: myAssignedQuery }), offeringController.myAssigned);

// Any authenticated role can browse (students need this to enroll later)
router.get("/", validate({ query: listOfferingsQuery }), offeringController.list);
router.get("/:id", validate({ params: idParamSchema }), offeringController.getById);

// ADMIN only
router.post("/", authorize(Role.ADMIN), validate({ body: createOfferingSchema }), offeringController.create);
router.patch(
  "/:id/assign-teacher",
  authorize(Role.ADMIN),
  validate({ params: idParamSchema, body: assignTeacherSchema }),
  offeringController.assignTeacher,
);
router.patch(
  "/:id/capacity",
  authorize(Role.ADMIN),
  validate({ params: idParamSchema, body: updateCapacitySchema }),
  offeringController.updateCapacity,
);
router.delete("/:id", authorize(Role.ADMIN), validate({ params: idParamSchema }), offeringController.remove);

export const offeringRoutes = router;