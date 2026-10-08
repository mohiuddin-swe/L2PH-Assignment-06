import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { validate } from "../../middlewares/validate";
import { idParamSchema } from "../../utils/commonValidation";
import { noticeController } from "./notice.controller";
import { createNoticeSchema, listNoticesQuery, updateNoticeSchema } from "./notice.validation";

const router = Router();

router.use(authenticate);

// Everyone logged in can read notices
router.get("/", validate({ query: listNoticesQuery }), noticeController.list);
router.get("/:id", validate({ params: idParamSchema }), noticeController.getById);

// ADMIN and TEACHER can publish; edit/delete is limited to own notices for teachers (checked in the service)
router.post("/", authorize(Role.ADMIN, Role.TEACHER), validate({ body: createNoticeSchema }), noticeController.create);
router.patch(
  "/:id",
  authorize(Role.ADMIN, Role.TEACHER),
  validate({ params: idParamSchema, body: updateNoticeSchema }),
  noticeController.update,
);
router.delete("/:id", authorize(Role.ADMIN, Role.TEACHER), validate({ params: idParamSchema }), noticeController.remove);

export const noticeRoutes = router;