import { EnrollmentStatus, Prisma, ResultStatus, Role } from "@prisma/client";
import { AppError } from "../../errors/AppError";
import { prisma } from "../../lib/prisma";
import { logActivity } from "../../utils/audit";
import { calculateGpa, gradeFor } from "../../utils/grade";
import { buildMeta, getPagination } from "../../utils/pagination";
import { MyResultsQuery, OfferingResultsQuery, SaveResultInput } from "./result.validation";

const assertOfferingAccess = async (user: { id: string; role: Role }, offeringId: string) => {
  const offering = await prisma.courseOffering.findFirst({
    where: { id: offeringId, deletedAt: null },
    select: { id: true, teacherId: true },
  });
  if (!offering) throw new AppError(404, "Course offering not found");
  if (user.role === Role.TEACHER && offering.teacherId !== user.id) {
    throw new AppError(403, "You can only manage results of your own offerings");
  }
  return offering;
};

// Teacher enters (or corrects) marks. Result stays DRAFT, invisible to the student, until published.
const save = async (teacherId: string, { enrollmentId, marks }: SaveResultInput, ip?: string) => {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    select: { id: true, status: true, offering: { select: { teacherId: true, deletedAt: true } } },
  });
  if (!enrollment || enrollment.offering.deletedAt) throw new AppError(404, "Enrollment not found");
  if (enrollment.offering.teacherId !== teacherId) {
    throw new AppError(403, "You can only enter results for your own offerings");
  }
  if (enrollment.status !== EnrollmentStatus.ENROLLED) {
    throw new AppError(409, "Cannot enter a result for a dropped enrollment");
  }

  const { grade, gradePoint } = gradeFor(marks);

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.result.findUnique({ where: { enrollmentId }, select: { id: true, status: true, marks: true } });

      let result;
      if (existing) {
        // Conditional update: a result that was published a moment ago can never be overwritten.
        const { count } = await tx.result.updateMany({
          where: { id: existing.id, status: ResultStatus.DRAFT },
          data: { marks, grade, gradePoint },
        });
        if (count === 0) throw new AppError(409, "This result is already published and cannot be changed");
        result = await tx.result.findUniqueOrThrow({ where: { id: existing.id } });
      } else {
        result = await tx.result.create({ data: { enrollmentId, marks, grade, gradePoint } });
      }

      await logActivity(
        {
          actorId: teacherId,
          action: existing ? "RESULT_UPDATED" : "RESULT_CREATED",
          entity: "Result",
          entityId: result.id,
          before: existing ? { marks: existing.marks } : undefined,
          after: { enrollmentId, marks, grade },
          ip,
        },
        tx,
      );
      return result;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(409, "A result for this enrollment was just created, please retry");
    }
    throw err;
  }
};

// Publishes every DRAFT result of an offering in ONE transaction: all or nothing.
const publish = async (user: { id: string; role: Role }, offeringId: string, ip?: string) => {
  await assertOfferingAccess(user, offeringId);

  return prisma.$transaction(async (tx) => {
    const missing = await tx.enrollment.count({
      where: { offeringId, status: EnrollmentStatus.ENROLLED, result: { is: null } },
    });
    if (missing > 0) {
      throw new AppError(409, `Cannot publish: ${missing} enrolled student(s) have no result yet`);
    }

    const { count } = await tx.result.updateMany({
      where: { status: ResultStatus.DRAFT, enrollment: { offeringId, status: EnrollmentStatus.ENROLLED } },
      data: { status: ResultStatus.PUBLISHED, publishedAt: new Date() },
    });
    if (count === 0) throw new AppError(409, "There are no draft results to publish");

    await logActivity(
      { actorId: user.id, action: "RESULTS_PUBLISHED", entity: "CourseOffering", entityId: offeringId, after: { published: count }, ip },
      tx,
    );
    return { offeringId, published: count };
  });
};

const listByOffering = async (user: { id: string; role: Role }, offeringId: string, { page, limit, status }: OfferingResultsQuery) => {
  await assertOfferingAccess(user, offeringId);

  const where: Prisma.ResultWhereInput = {
    enrollment: { offeringId, status: EnrollmentStatus.ENROLLED },
    ...(status ? { status } : {}),
  };

  const [data, total] = await prisma.$transaction([
    prisma.result.findMany({
      where,
      select: {
        id: true,
        marks: true,
        grade: true,
        gradePoint: true,
        status: true,
        publishedAt: true,
        enrollment: { select: { id: true, student: { select: { id: true, name: true, email: true } } } },
      },
      orderBy: { createdAt: "asc" },
      ...getPagination(page, limit),
    }),
    prisma.result.count({ where }),
  ]);
  return { data, meta: buildMeta(page, limit, total) };
};

// Student view: PUBLISHED results only, plus semester GPA and overall CGPA (credit-weighted).
const mine = async (studentId: string, { semester }: MyResultsQuery) => {
  const rows = await prisma.result.findMany({
    where: { status: ResultStatus.PUBLISHED, enrollment: { studentId, status: EnrollmentStatus.ENROLLED } },
    select: {
      marks: true,
      grade: true,
      gradePoint: true,
      publishedAt: true,
      enrollment: {
        select: {
          offering: {
            select: { id: true, semester: true, section: true, course: { select: { code: true, title: true, credit: true } } },
          },
        },
      },
    },
    orderBy: { publishedAt: "desc" },
  });

  const items = rows.map((r) => ({
    semester: r.enrollment.offering.semester,
    credit: r.enrollment.offering.course.credit,
    gradePoint: r.gradePoint ?? 0,
    row: {
      offeringId: r.enrollment.offering.id,
      semester: r.enrollment.offering.semester,
      section: r.enrollment.offering.section,
      course: r.enrollment.offering.course,
      marks: r.marks,
      grade: r.grade,
      gradePoint: r.gradePoint,
      publishedAt: r.publishedAt,
    },
  }));

  const semesterNames = [...new Set(items.map((i) => i.semester))];
  const semesters = semesterNames.map((name) => ({
    semester: name,
    ...calculateGpa(items.filter((i) => i.semester === name)),
  }));
  const { gpa: cgpa, totalCredits } = calculateGpa(items);

  return {
    results: items.filter((i) => !semester || i.semester === semester).map((i) => i.row),
    semesters,
    cgpa,
    totalCredits,
  };
};

export const resultService = { save, publish, listByOffering, mine };