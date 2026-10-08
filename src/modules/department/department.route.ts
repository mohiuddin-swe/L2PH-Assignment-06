import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { validate } from "../../middlewares/validate";
import { idParamSchema } from "../../utils/commonValidation";
import { departmentController } from "./department.controller";
import { createDepartmentSchema, listDepartmentsQuery, updateDepartmentSchema } from "./department.validation";

const router = Router();

router.use(authenticate);

// Any authenticated role can read
router.get("/", validate({ query: listDepartmentsQuery }), departmentController.list);
router.get("/:id", validate({ params: idParamSchema }), departmentController.getById);

// ADMIN only
router.post("/", authorize(Role.ADMIN), validate({ body: createDepartmentSchema }), departmentController.create);
router.patch(
  "/:id",
  authorize(Role.ADMIN),
  validate({ params: idParamSchema, body: updateDepartmentSchema }),
  departmentController.update,
);
router.delete("/:id", authorize(Role.ADMIN), validate({ params: idParamSchema }), departmentController.remove);

export const departmentRoutes = router;