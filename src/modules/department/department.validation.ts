import { z } from "zod";
import { nonEmptyBody } from "../../utils/commonValidation";
import { paginationShape } from "../../utils/pagination";

const name = z.string().trim().min(2, "Name must be at least 2 characters").max(100);
const code = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{2,10}$/, "Code must be 2-10 letters or digits");

export const createDepartmentSchema = z.object({ name, code }).strict();

export const updateDepartmentSchema = z
  .object({ name: name.optional(), code: code.optional() })
  .strict()
  .refine(nonEmptyBody, { message: "At least one field is required" });

export const listDepartmentsQuery = z.object({
  ...paginationShape,
  q: z.string().trim().min(1).optional(),
});

export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;
export type ListDepartmentsQuery = z.infer<typeof listDepartmentsQuery>;