import { InvoiceStatus } from "@prisma/client";
import { z } from "zod";
import { paginationShape } from "../../utils/pagination";

const amount = z
  .number()
  .positive("Amount must be greater than 0")
  .max(10_000_000, "Amount is too large")
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "Amount can have at most 2 decimal places");

export const createInvoiceSchema = z
  .object({
    studentId: z.string().uuid("Invalid studentId"),
    title: z.string().trim().min(3, "Title must be at least 3 characters").max(150),
    semester: z.string().trim().min(3).max(30).optional(), // must match the offering semester to gate enrollment
    amount,
    dueDate: z.coerce.date().optional(),
  })
  .strict();

export const listInvoicesQuery = z.object({
  ...paginationShape,
  status: z.nativeEnum(InvoiceStatus).optional(),
  studentId: z.string().uuid("Invalid studentId").optional(),
  semester: z.string().trim().min(1).optional(),
  q: z.string().trim().min(1).optional(),
  sortBy: z.enum(["createdAt", "amount", "dueDate"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export const myInvoicesQuery = z.object({
  ...paginationShape,
  status: z.nativeEnum(InvoiceStatus).optional(),
  semester: z.string().trim().min(1).optional(),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type ListInvoicesQuery = z.infer<typeof listInvoicesQuery>;
export type MyInvoicesQuery = z.infer<typeof myInvoicesQuery>;