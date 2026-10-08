import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { validate } from "../../middlewares/validate";
import { idParamSchema } from "../../utils/commonValidation";
import { resultController } from "./result.controller";
import { myResultsQuery, offeringResultsQuery, saveResultSchema } from "./result.validation";

const router = Router();

router.use(authenticate);

// STUDENT: published results + semester GPA + CGPA
router.get("/my", authorize(Role.STUDENT), validate({ query: myResultsQuery }), resultController.mine);

// TEACHER (owner of the offering): enter / correct marks (stays DRAFT)
router.put("/", authorize(Role.TEACHER), validate({ body: saveResultSchema }), resultController.save);

// TEACHER (owner) or ADMIN
router.get(
  "/offerings/:id",
  authorize(Role.TEACHER, Role.ADMIN),
  validate({ params: idParamSchema, query: offeringResultsQuery }),
  resultController.listByOffering,
);
router.post(
  "/offerings/:id/publish",
  authorize(Role.TEACHER, Role.ADMIN),
  validate({ params: idParamSchema }),
  resultController.publish,
);

export const resultRoutes = router;