import { ResultStatus } from "@prisma/client";
import { z } from "zod";
import { paginationShape } from "../../utils/pagination";

export const saveResultSchema = z
  .object({
    enrollmentId: z.string().uuid("Invalid enrollmentId"),
    marks: z.number().min(0, "Marks must be at least 0").max(100, "Marks must be at most 100"),
  })
  .strict();

export const offeringResultsQuery = z.object({
  ...paginationShape,
  status: z.nativeEnum(ResultStatus).optional(),
});

export const myResultsQuery = z.object({
  semester: z.string().trim().min(1).optional(),
});

export type SaveResultInput = z.infer<typeof saveResultSchema>;
export type OfferingResultsQuery = z.infer<typeof offeringResultsQuery>;
export type MyResultsQuery = z.infer<typeof myResultsQuery>;