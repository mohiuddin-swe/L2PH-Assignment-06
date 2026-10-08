import { z } from "zod";
import { nonEmptyBody } from "../../utils/commonValidation";
import { paginationShape } from "../../utils/pagination";

const code = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9-]{3,15}$/, "Code must be 3-15 characters (letters, digits, hyphen)");
const title = z.string().trim().min(3, "Title must be at least 3 characters").max(150);
const description = z.string().trim().max(1000);
const credit = z.number().int().min(1, "Credit must be at least 1").max(6, "Credit must be at most 6");

export const createCourseSchema = z
  .object({
    code,
    title,
    description: description.optional(),
    credit: credit.default(3),
    departmentId: z.string().uuid("Invalid departmentId"),
  })
  .strict();

export const updateCourseSchema = z
  .object({
    code: code.optional(),
    title: title.optional(),
    description: description.nullable().optional(),
    credit: credit.optional(),
    departmentId: z.string().uuid("Invalid departmentId").optional(),
  })
  .strict()
  .refine(nonEmptyBody, { message: "At least one field is required" });

export const listCoursesQuery = z.object({
  ...paginationShape,
  q: z.string().trim().min(1).optional(),
  departmentId: z.string().uuid("Invalid departmentId").optional(),
  credit: z.coerce.number().int().min(1).max(6).optional(),
  sortBy: z.enum(["createdAt", "title", "code", "credit"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
export type ListCoursesQuery = z.infer<typeof listCoursesQuery>;