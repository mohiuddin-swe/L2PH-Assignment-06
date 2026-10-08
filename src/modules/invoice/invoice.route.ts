import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { validate } from "../../middlewares/validate";
import { idParamSchema } from "../../utils/commonValidation";
import { invoiceController } from "./invoice.controller";
import { createInvoiceSchema, listInvoicesQuery, myInvoicesQuery } from "./invoice.validation";

const router = Router();

router.use(authenticate);

// STUDENT (declared before "/:id" so "my" is not treated as an id)
router.get("/my", authorize(Role.STUDENT), validate({ query: myInvoicesQuery }), invoiceController.listMine);

// ADMIN
router.post("/", authorize(Role.ADMIN), validate({ body: createInvoiceSchema }), invoiceController.create);
router.get("/", authorize(Role.ADMIN), validate({ query: listInvoicesQuery }), invoiceController.list);
router.patch("/:id/cancel", authorize(Role.ADMIN), validate({ params: idParamSchema }), invoiceController.cancel);

// ADMIN (any invoice) or STUDENT (own invoice only, enforced in the service)
router.get("/:id", authorize(Role.ADMIN, Role.STUDENT), validate({ params: idParamSchema }), invoiceController.getById);

export const invoiceRoutes = router;