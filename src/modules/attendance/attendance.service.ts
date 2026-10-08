import { AttendanceStatus, EnrollmentStatus, Prisma, Role } from "@prisma/client";
import { AppError } from "../../errors/AppError";
import { prisma } from "../../lib/prisma";
import { logActivity } from "../../utils/audit";
import { buildMeta, getPagination } from "../../utils/pagination";
import {
  MarkAttendanceInput,
  MyAttendanceQuery,
  OfferingAttendanceQuery,
  toDbDate,
} from "./attendance.validation";

// Only the teacher who owns the offering (or an admin, when allowAdmin is true) may touch its attendance.
const assertOfferingAccess = async (user: { id: string; role: Role }, offeringId: string, allowAdmin: boolean) => {
  const offering = await prisma.courseOffering.findFirst({
    where: { id: offeringId, deletedAt: null },
    select: { id: true, teacherId: true },
  });
  if (!offering) throw new AppError(404, "Course offering not found");
  const isOwner = user.role === Role.TEACHER && offering.teacherId === user.id;
  const isAdmin = user.role === Role.ADMIN && allowAdmin;
  if (!isOwner && !isAdmin) throw new AppError(403, "You can only manage attendance of your own offerings");
  return offering;
};

const mark = async (user: { id: string; role: Role }, input: MarkAttendanceInput, ip?: string) => {
  await assertOfferingAccess(user, input.offeringId, false);

  // Every enrollment in the request must belong to THIS offering and still be active.
  const ids = input.records.map((r) => r.enrollmentId);
  const valid = await prisma.enrollment.count({
    where: { id: { in: ids }, offeringId: input.offeringId, status: EnrollmentStatus.ENROLLED },
  });
  if (valid !== ids.length) {
    throw new AppError(400, "Some enrollments do not belong to this offering or are no longer active");
  }

  const date = toDbDate(input.date);

  await prisma.$transaction(
    async (tx) => {
      // Upsert on the unique (enrollmentId, date): marking the same day twice updates, never duplicates.
      for (const r of input.records) {
        await tx.attendance.upsert({
          where: { enrollmentId_date: { enrollmentId: r.enrollmentId, date } },
          create: { enrollmentId: r.enrollmentId, date, status: r.status },
          update: { status: r.status },
        });
      }
      await logActivity(
        {
          actorId: user.id,
          action: "ATTENDANCE_MARKED",
          entity: "CourseOffering",
          entityId: input.offeringId,
          after: { date: input.date, count: input.records.length },
          ip,
        },
        tx,
      );
    },
    { timeout: 20000 },
  );

  return { offeringId: input.offeringId, date: input.date, saved: input.records.length };
};

const listByOffering = async (
  user: { id: string; role: Role },
  offeringId: string,
  { page, limit, date, status }: OfferingAttendanceQuery,
) => {
  await assertOfferingAccess(user, offeringId, true);

  const where: Prisma.AttendanceWhereInput = {
    enrollment: { offeringId },
    ...(date ? { date: toDbDate(date) } : {}),
    ...(status ? { status } : {}),
  };

  const [rows, total] = await prisma.$transaction([
    prisma.attendance.findMany({
      where,
      select: {
        id: true,
        date: true,
        status: true,
        enrollment: {
          select: { id: true, student: { select: { id: true, name: true, email: true } } },
        },
      },
      orderBy: [{ date: "desc" }, { createdAt: "asc" }],
      ...getPagination(page, limit),
    }),
    prisma.attendance.count({ where }),
  ]);

  const data = rows.map((r) => ({
    id: r.id,
    date: r.date.toISOString().slice(0, 10),
    status: r.status,
    enrollmentId: r.enrollment.id,
    student: r.enrollment.student,
  }));
  return { data, meta: buildMeta(page, limit, total) };
};

const mine = async (studentId: string, { offeringId }: MyAttendanceQuery) => {
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId, status: EnrollmentStatus.ENROLLED, ...(offeringId ? { offeringId } : {}) },
    select: {
      id: true,
      offering: {
        select: {
          id: true,
          semester: true,
          section: true,
          course: { select: { code: true, title: true } },
        },
      },
      attendances: { select: { date: true, status: true }, orderBy: { date: "desc" } },
    },
    orderBy: { createdAt: "desc" },
  });

  return enrollments.map((e) => {
    const total = e.attendances.length;
    const present = e.attendances.filter((a) => a.status === AttendanceStatus.PRESENT).length;
    const late = e.attendances.filter((a) => a.status === AttendanceStatus.LATE).length;
    const absent = total - present - late;
    return {
      enrollmentId: e.id,
      offering: e.offering,
      // LATE still counts as attended
      summary: {
        totalClasses: total,
        present,
        late,
        absent,
        percentage: total === 0 ? null : Math.round(((present + late) / total) * 10000) / 100,
      },
      records: e.attendances.map((a) => ({ date: a.date.toISOString().slice(0, 10), status: a.status })),
    };
  });
};

export const attendanceService = { mark, listByOffering, mine };