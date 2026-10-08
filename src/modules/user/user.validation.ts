import { z } from "zod";
import { phoneSchema } from "../auth/auth.validation";

// .strict(): role, email, status etc. are rejected, a user can only edit name/phone.
export const updateMeSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(100).optional(),
    phone: phoneSchema.nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field is required" });

export type UpdateMeInput = z.infer<typeof updateMeSchema>;