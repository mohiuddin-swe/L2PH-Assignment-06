import { Role, UserStatus } from "@prisma/client";
import { z } from "zod";
import { phoneSchema } from "../auth/auth.validation";
import { paginationShape } from "../../utils/pagination";

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters")
  .regex(/[A-Za-z]/, "Password must contain at least one letter")
  .regex(/\d/, "Password must contain at least one number");

export const createUserSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
    email: z.string().trim().toLowerCase().email("Invalid email address"),
    password: passwordSchema,
    role: z.nativeEnum(Role),
    phone: phoneSchema.optional(),
    departmentId: z.string().uuid("Invalid departmentId").optional(),
    designation: z.string().trim().min(2).max(100).optional(),
  })
  .strict()
  .refine((d) => d.role !== Role.ADMIN || (!d.departmentId && !d.designation), {
    message: "An admin cannot have a department or designation",
    path: ["role"],
  })
  .refine((d) => d.role === Role.TEACHER || !d.designation, {
    message: "Only a teacher can have a designation",
    path: ["designation"],
  });

export const changeRoleSchema = z.object({ role: z.nativeEnum(Role) }).strict();
export const changeStatusSchema = z.object({ status: z.nativeEnum(UserStatus) }).strict();

export const listUsersQuery = z.object({
  ...paginationShape,
  role: z.nativeEnum(Role).optional(),
  status: z.nativeEnum(UserStatus).optional(),
  q: z.string().trim().min(1).optional(),
  sortBy: z.enum(["createdAt", "name", "email"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export const auditLogsQuery = z.object({
  ...paginationShape,
  actorId: z.string().uuid("Invalid actorId").optional(),
  entity: z.string().trim().min(1).optional(),
  entityId: z.string().trim().min(1).optional(),
  action: z.string().trim().min(1).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuery>;
export type AuditLogsQuery = z.infer<typeof auditLogsQuery>;