import { PaymentGateway, PaymentStatus } from "@prisma/client";
import { z } from "zod";
import { paginationShape } from "../../utils/pagination";

export const initiatePaymentSchema = z.object({ invoiceId: z.string().uuid("Invalid invoiceId") }).strict();

export const myPaymentsQuery = z.object({
  ...paginationShape,
  status: z.nativeEnum(PaymentStatus).optional(),
});

export const listPaymentsQuery = z.object({
  ...paginationShape,
  status: z.nativeEnum(PaymentStatus).optional(),
  gateway: z.nativeEnum(PaymentGateway).optional(),
  userId: z.string().uuid("Invalid userId").optional(),
  invoiceId: z.string().uuid("Invalid invoiceId").optional(),
});

export type MyPaymentsQuery = z.infer<typeof myPaymentsQuery>;
export type ListPaymentsQuery = z.infer<typeof listPaymentsQuery>;