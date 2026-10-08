import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { validate } from "../../middlewares/validate";
import { userController } from "./user.controller";
import { updateMeSchema } from "./user.validation";

const router = Router();

router.use(authenticate);
router.get("/me", userController.getMe);
router.patch("/me", validate({ body: updateMeSchema }), userController.updateMe);

export const userRoutes = router;