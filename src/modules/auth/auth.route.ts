import { Router } from "express";
import { validate } from "../../middlewares/validate";
import { authController } from "./auth.controller";
import { loginSchema, refreshTokenSchema, registerSchema } from "./auth.validation";

const router = Router();

router.post("/register", validate({ body: registerSchema }), authController.register);
router.post("/login", validate({ body: loginSchema }), authController.login);
router.post("/refresh-token", validate({ body: refreshTokenSchema }), authController.refreshToken);
router.post("/logout", validate({ body: refreshTokenSchema }), authController.logout);

router.get("/google", authController.googleRedirect);
router.get("/google/callback", authController.googleCallback);

export const authRoutes = router;