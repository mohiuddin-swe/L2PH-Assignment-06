import { z } from "zod";
import { nonEmptyBody } from "../../utils/commonValidation";
import { paginationShape } from "../../utils/pagination";

const title = z.string().trim().min(3, "Title must be at least 3 characters").max(150);
const content = z.string().trim().min(1, "Content is required").max(5000);

export const createNoticeSchema = z.object({ title, content }).strict();

export const updateNoticeSchema = z
  .object({ title: title.optional(), content: content.optional() })
  .strict()
  .refine(nonEmptyBody, { message: "At least one field is required" });

export const listNoticesQuery = z.object({
  ...paginationShape,
  q: z.string().trim().min(1).optional(),
  sortBy: z.enum(["createdAt", "title"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export type CreateNoticeInput = z.infer<typeof createNoticeSchema>;
export type UpdateNoticeInput = z.infer<typeof updateNoticeSchema>;
export type ListNoticesQuery = z.infer<typeof listNoticesQuery>;