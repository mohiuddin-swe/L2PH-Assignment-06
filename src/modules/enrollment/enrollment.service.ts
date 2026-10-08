import { EnrollmentStatus, InvoiceStatus, Prisma, ResultStatus, Role } from "@prisma/client";
import { AppError } from "../../errors/AppError";
import { prisma } from "../../lib/prisma";
import { logActivity } from "../../utils/audit";
import { buildMeta, getPagination } from "../../utils/pagination";
import { MyEnrollmentsQuery, OfferingEnrollmentsQuery } from "./enrollment.validation";

export const MAX_CREDITS_PER_SEMESTER = 18;

const select = {
  id: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  offering: {
    select: {
      id: true,
      semester: true,
      section: true,
      course: { select: { id: true, code: true, title: true, credit: true } },
      teacher: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.EnrollmentSelect;

const enroll = async (studentId: string, offeringId: string, ip?: string) => {
  try {
    return await prisma.$transaction(async (tx) => {
      const offering = await tx.courseOffering.findFirst({
        where: { id: offeringId, deletedAt: null },
        select: { id: true, semester: true, courseId: true, course: { select: { credit: true } } },
      });
      if (!offering) throw new AppError(404, "Course offering not found");


      // Fee rule: an unpaid fee invoice for this semester blocks enrollment until it is paid.
      const unpaid = await tx.feeInvoice.findFirst({
        where: { studentId, semester: offering.semester, status: InvoiceStatus.UNPAID, deletedAt: null },
        select: { title: true },
      });
      if (unpaid) {
        throw new AppError(402, `Please pay your fee invoice "${unpaid.title}" before enrolling in ${offering.semester} courses`);
      }

      const existing = await tx.enrollment.findUnique({
        where: { studentId_offeringId: { studentId, offeringId } },
        select: { id: true, status: true },
      });
      if (existing?.status === EnrollmentStatus.ENROLLED) {
        throw new AppError(409, "You are already enrolled in this offering");
      }

      // Business rules: one section per course per semester, and a credit cap per semester.
      const active = await tx.enrollment.findMany({
        where: {
          studentId,
          status: EnrollmentStatus.ENROLLED,
          offering: { semester: offering.semester, deletedAt: null },
        },
        select: { offering: { select: { courseId: true, course: { select: { credit: true } } } } },
      });
      if (active.some((e) => e.offering.courseId === offering.courseId)) {
        throw new AppError(409, "You are already enrolled in another section of this course this semester");
      }
      const usedCredits = active.reduce((sum, e) => sum + e.offering.course.credit, 0);
      if (usedCredits + offering.course.credit > MAX_CREDITS_PER_SEMESTER) {
        throw new AppError(
          409,
          `Credit limit exceeded: maximum ${MAX_CREDITS_PER_SEMESTER} credits per semester (you already have ${usedCredits})`,
        );
      }

      // Re-enrolling after a drop reuses the same row. The conditional update means two
      // concurrent re-enroll requests cannot both succeed.
      if (existing) {
        const { count } = await tx.enrollment.updateMany({
          where: { id: existing.id, status: EnrollmentStatus.DROPPED },
          data: { status: EnrollmentStatus.ENROLLED },
        });
        if (count === 0) throw new AppError(409, "You are already enrolled in this offering");
      }

      // Atomic seat claim: the database checks "enrolledCount < capacity" and increments in ONE
      // statement, so two students racing for the last seat cannot both win (no overbooking).
      const seat = await tx.courseOffering.updateMany({
        where: { id: offeringId, deletedAt: null, enrolledCount: { lt: tx.courseOffering.fields.capacity } },
        data: { enrolledCount: { increment: 1 } },
      });
      if (seat.count === 0) throw new AppError(409, "No seats available for this offering");

      const enrollment = existing
        ? await tx.enrollment.findUniqueOrThrow({ where: { id: existing.id }, select })
        : await tx.enrollment.create({ data: { studentId, offeringId }, select });

      await logActivity(
        {
          actorId: studentId,
          action: "ENROLLMENT_CREATED",
          entity: "Enrollment",
          entityId: enrollment.id,
          after: { offeringId, studentId },
          ip,
        },
        tx,
      );
      return enrollment;
    });
  } catch (err) {
    // Same student double-clicking: the unique (studentId, offeringId) index rejects the second
    // insert and the whole transaction (including the seat increment) rolls back.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(409, "You are already enrolled in this offering");
    }
    throw err;
  }
};

const drop = (enrollmentId: string, studentId: string, ip?: string) =>
  prisma.$transaction(async (tx) => {
    // Filtering by studentId means a student can never drop someone else's enrollment (404, not 403).
    const enrollment = await tx.enrollment.findFirst({
      where: { id: enrollmentId, studentId },
      select: { id: true, status: true, offeringId: true, result: { select: { status: true } } },
    });
    if (!enrollment) throw new AppError(404, "Enrollment not found");
    if (enrollment.status !== EnrollmentStatus.ENROLLED) throw new AppError(409, "This enrollment is already dropped");
    if (enrollment.result?.status === ResultStatus.PUBLISHED) {
      throw new AppError(409, "Cannot drop a course after its result has been published");
    }

    const { count } = await tx.enrollment.updateMany({
      where: { id: enrollment.id, status: EnrollmentStatus.ENROLLED },
      data: { status: EnrollmentStatus.DROPPED },
    });
    if (count === 0) throw new AppError(409, "This enrollment is already dropped");

    await tx.courseOffering.updateMany({
      where: { id: enrollment.offeringId, enrolledCount: { gt: 0 } },
      data: { enrolledCount: { decrement: 1 } },
    });

    const updated = await tx.enrollment.findUniqueOrThrow({ where: { id: enrollment.id }, select });
    await logActivity(
      {
        actorId: studentId,
        action: "ENROLLMENT_DROPPED",
        entity: "Enrollment",
        entityId: enrollment.id,
        before: { status: EnrollmentStatus.ENROLLED },
        after: { status: EnrollmentStatus.DROPPED },
        ip,
      },
      tx,
    );
    return updated;
  });

const listMine = async (studentId: string, { page, limit, status, semester }: MyEnrollmentsQuery) => {
  const where: Prisma.EnrollmentWhereInput = {
    studentId,
    ...(status ? { status } : {}),
    ...(semester ? { offering: { semester } } : {}),
  };

  const [data, total] = await prisma.$transaction([
    prisma.enrollment.findMany({ where, select, orderBy: { createdAt: "desc" }, ...getPagination(page, limit) }),
    prisma.enrollment.count({ where }),
  ]);
  return { data, meta: buildMeta(page, limit, total) };
};

const listByOffering = async (
  user: { id: string; role: Role },
  offeringId: string,
  { page, limit, status, q }: OfferingEnrollmentsQuery,
) => {
  const offering = await prisma.courseOffering.findFirst({
    where: { id: offeringId, deletedAt: null },
    select: { id: true, teacherId: true },
  });
  if (!offering) throw new AppError(404, "Course offering not found");
  // A teacher may only see the students of their own offerings. Admin can see all.
  if (user.role === Role.TEACHER && offering.teacherId !== user.id) {
    throw new AppError(403, "You can only view students of your own offerings");
  }

  const where: Prisma.EnrollmentWhereInput = {
    offeringId,
    status,
    ...(q
      ? {
          student: {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { studentProfile: { studentId: { contains: q, mode: "insensitive" } } },
            ],
          },
        }
      : {}),
  };

  const [data, total] = await prisma.$transaction([
    prisma.enrollment.findMany({
      where,
      select: {
        id: true,
        status: true,
        createdAt: true,
        student: { select: { id: true, name: true, email: true, studentProfile: { select: { studentId: true } } } },
      },
      orderBy: { createdAt: "asc" },
      ...getPagination(page, limit),
    }),
    prisma.enrollment.count({ where }),
  ]);
  return { data, meta: buildMeta(page, limit, total) };
};

export const enrollmentService = { enroll, drop, listMine, listByOffering };