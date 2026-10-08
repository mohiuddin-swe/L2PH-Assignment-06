import { EnrollmentStatus } from "@prisma/client";
import { z } from "zod";
import { paginationShape } from "../../utils/pagination";

export const enrollSchema = z.object({ offeringId: z.string().uuid("Invalid offeringId") }).strict();

export const myEnrollmentsQuery = z.object({
  ...paginationShape,
  status: z.nativeEnum(EnrollmentStatus).optional(),
  semester: z.string().trim().min(1).optional(),
});

export const offeringEnrollmentsQuery = z.object({
  ...paginationShape,
  status: z.nativeEnum(EnrollmentStatus).default(EnrollmentStatus.ENROLLED),
  q: z.string().trim().min(1).optional(),
});

export type MyEnrollmentsQuery = z.infer<typeof myEnrollmentsQuery>;
export type OfferingEnrollmentsQuery = z.infer<typeof offeringEnrollmentsQuery>;