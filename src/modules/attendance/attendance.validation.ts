import { AttendanceStatus } from "@prisma/client";
import { z } from "zod";
import { paginationShape } from "../../utils/pagination";

export const toDbDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
  .refine((v) => {
    const d = toDbDate(v);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Invalid calendar date")
  .refine((v) => toDbDate(v).getTime() <= Date.now() + 24 * 60 * 60 * 1000, "Date cannot be in the future");

const record = z
  .object({
    enrollmentId: z.string().uuid("Invalid enrollmentId"),
    status: z.nativeEnum(AttendanceStatus),
  })
  .strict();

export const markAttendanceSchema = z
  .object({
    offeringId: z.string().uuid("Invalid offeringId"),
    date: dateString,
    records: z.array(record).min(1, "At least one record is required").max(200, "At most 200 records per request"),
  })
  .strict()
  .refine((d) => new Set(d.records.map((r) => r.enrollmentId)).size === d.records.length, {
    message: "Duplicate enrollmentId in records",
    path: ["records"],
  });

export const offeringAttendanceQuery = z.object({
  ...paginationShape,
  date: dateString.optional(),
  status: z.nativeEnum(AttendanceStatus).optional(),
});

export const myAttendanceQuery = z.object({
  offeringId: z.string().uuid("Invalid offeringId").optional(),
});

export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;
export type OfferingAttendanceQuery = z.infer<typeof offeringAttendanceQuery>;
export type MyAttendanceQuery = z.infer<typeof myAttendanceQuery>;