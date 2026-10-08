import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { validate } from "../../middlewares/validate";
import { idParamSchema } from "../../utils/commonValidation";
import { courseController } from "./course.controller";
import { createCourseSchema, listCoursesQuery, updateCourseSchema } from "./course.validation";

const router = Router();

router.use(authenticate);

// Any authenticated role can read (supports ?page=&limit=&q=&departmentId=&credit=&sortBy=&order=)
router.get("/", validate({ query: listCoursesQuery }), courseController.list);
router.get("/:id", validate({ params: idParamSchema }), courseController.getById);

// ADMIN only
router.post("/", authorize(Role.ADMIN), validate({ body: createCourseSchema }), courseController.create);
router.patch(
  "/:id",
  authorize(Role.ADMIN),
  validate({ params: idParamSchema, body: updateCourseSchema }),
  courseController.update,
);
router.delete("/:id", authorize(Role.ADMIN), validate({ params: idParamSchema }), courseController.remove);

export const courseRoutes = router;