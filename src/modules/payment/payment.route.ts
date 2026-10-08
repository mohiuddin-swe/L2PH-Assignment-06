import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { validate } from "../../middlewares/validate";
import { idParamSchema } from "../../utils/commonValidation";
import { paymentController } from "./payment.controller";
import { initiatePaymentSchema, listPaymentsQuery, myPaymentsQuery } from "./payment.validation";

// Mounted at /payments (JWT protected)
const router = Router();
router.use(authenticate);

router.post("/initiate", authorize(Role.STUDENT), validate({ body: initiatePaymentSchema }), paymentController.initiate);
router.get("/my", authorize(Role.STUDENT), validate({ query: myPaymentsQuery }), paymentController.listMine);
router.get("/", authorize(Role.ADMIN), validate({ query: listPaymentsQuery }), paymentController.list);
router.get("/:id", authorize(Role.ADMIN, Role.STUDENT), validate({ params: idParamSchema }), paymentController.getById);

// Mounted at /payments/gateway (public: called by the payment gateway, verified server-to-server)
const callbackRouter = Router();
callbackRouter.all("/success", paymentController.gatewaySuccess);
callbackRouter.all("/fail", paymentController.gatewayFail);
callbackRouter.all("/cancel", paymentController.gatewayCancel);
callbackRouter.all("/ipn", paymentController.gatewayIpn);

export const paymentRoutes = router;
export const paymentCallbackRoutes = callbackRouter;