import { z } from "zod";
import { paginationShape } from "../../utils/pagination";

const semester = z.string().trim().min(3, "Semester must be at least 3 characters").max(30);
const capacity = z.number().int().min(1, "Capacity must be at least 1").max(500, "Capacity must be at most 500");

export const createOfferingSchema = z
  .object({
    courseId: z.string().uuid("Invalid courseId"),
    teacherId: z.string().uuid("Invalid teacherId"),
    semester, // e.g. "Fall 2026"
    section: z.string().trim().toUpperCase().min(1).max(5).default("A"),
    capacity,
  })
  .strict();

export const assignTeacherSchema = z.object({ teacherId: z.string().uuid("Invalid teacherId") }).strict();

export const updateCapacitySchema = z.object({ capacity }).strict();

export const listOfferingsQuery = z.object({
  ...paginationShape,
  semester: z.string().trim().min(1).optional(),
  courseId: z.string().uuid("Invalid courseId").optional(),
  teacherId: z.string().uuid("Invalid teacherId").optional(),
  sortBy: z.enum(["createdAt", "semester"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export const myAssignedQuery = z.object({
  ...paginationShape,
  semester: z.string().trim().min(1).optional(),
});

export type CreateOfferingInput = z.infer<typeof createOfferingSchema>;
export type ListOfferingsQuery = z.infer<typeof listOfferingsQuery>;
export type MyAssignedQuery = z.infer<typeof myAssignedQuery>;