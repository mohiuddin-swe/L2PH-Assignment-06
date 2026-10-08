import { Prisma, Role, UserStatus } from "@prisma/client";
import { AppError } from "../../errors/AppError";
import { prisma } from "../../lib/prisma";
import { logActivity } from "../../utils/audit";
import { buildMeta, getPagination } from "../../utils/pagination";
import { CreateOfferingInput, ListOfferingsQuery, MyAssignedQuery } from "./offering.validation";

const select = {
  id: true,
  semester: true,
  section: true,
  capacity: true,
  enrolledCount: true,
  createdAt: true,
  updatedAt: true,
  course: { select: { id: true, code: true, title: true, credit: true } },
  teacher: { select: { id: true, name: true, email: true } },
} satisfies Prisma.CourseOfferingSelect;

const withSeats = <T extends { capacity: number; enrolledCount: number }>(offering: T) => ({
  ...offering,
  availableSeats: offering.capacity - offering.enrolledCount,
});

const findActiveOrThrow = async (id: string) => {
  const offering = await prisma.courseOffering.findFirst({ where: { id, deletedAt: null }, select });
  if (!offering) throw new AppError(404, "Course offering not found");
  return offering;
};

const assertActiveTeacher = async (teacherId: string) => {
  const teacher = await prisma.user.findFirst({
    where: { id: teacherId, role: Role.TEACHER, status: UserStatus.ACTIVE, deletedAt: null },
    select: { id: true },
  });
  if (!teacher) throw new AppError(400, "Teacher not found or user is not an active teacher");
};

const create = async (input: CreateOfferingInput, actorId: string, ip?: string) => {
  const course = await prisma.course.findFirst({ where: { id: input.courseId, deletedAt: null }, select: { id: true } });
  if (!course) throw new AppError(404, "Course not found");
  await assertActiveTeacher(input.teacherId);

  try {
    return await prisma.$transaction(async (tx) => {
      const offering = await tx.courseOffering.create({ data: input, select });
      await logActivity(
        {
          actorId,
          action: "OFFERING_CREATED",
          entity: "CourseOffering",
          entityId: offering.id,
          after: { courseId: input.courseId, teacherId: input.teacherId, semester: input.semester, section: input.section, capacity: input.capacity },
          ip,
        },
        tx,
      );
      return withSeats(offering);
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(409, "This course already has an offering for this semester and section");
    }
    throw err;
  }
};

const list = async (query: ListOfferingsQuery) => {
  const { page, limit, semester, courseId, teacherId, sortBy, order } = query;

  const where: Prisma.CourseOfferingWhereInput = {
    deletedAt: null,
    ...(semester ? { semester } : {}),
    ...(courseId ? { courseId } : {}),
    ...(teacherId ? { teacherId } : {}),
  };

  const [rows, total] = await prisma.$transaction([
    prisma.courseOffering.findMany({
      where,
      select,
      orderBy: { [sortBy]: order } as Prisma.CourseOfferingOrderByWithRelationInput,
      ...getPagination(page, limit),
    }),
    prisma.courseOffering.count({ where }),
  ]);
  return { data: rows.map(withSeats), meta: buildMeta(page, limit, total) };
};

const getById = async (id: string) => withSeats(await findActiveOrThrow(id));

const assignTeacher = async (id: string, teacherId: string, actorId: string, ip?: string) => {
  const before = await findActiveOrThrow(id);
  await assertActiveTeacher(teacherId);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.courseOffering.update({ where: { id }, data: { teacherId }, select });
    await logActivity(
      {
        actorId,
        action: "OFFERING_TEACHER_ASSIGNED",
        entity: "CourseOffering",
        entityId: id,
        before: { teacherId: before.teacher.id },
        after: { teacherId },
        ip,
      },
      tx,
    );
    return withSeats(updated);
  });
};

const updateCapacity = async (id: string, capacity: number, actorId: string, ip?: string) => {
  const before = await findActiveOrThrow(id);

  return prisma.$transaction(async (tx) => {
    // Conditional update: capacity can never drop below the students already enrolled,
    // even if an enrollment happens at the same moment.
    const { count } = await tx.courseOffering.updateMany({
      where: { id, deletedAt: null, enrolledCount: { lte: capacity } },
      data: { capacity },
    });
    if (count === 0) throw new AppError(409, "Capacity cannot be lower than the number of enrolled students");

    const updated = await tx.courseOffering.findUniqueOrThrow({ where: { id }, select });
    await logActivity(
      { actorId, action: "OFFERING_CAPACITY_UPDATED", entity: "CourseOffering", entityId: id, before: { capacity: before.capacity }, after: { capacity }, ip },
      tx,
    );
    return withSeats(updated);
  });
};

const remove = async (id: string, actorId: string, ip?: string) => {
  await findActiveOrThrow(id);

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.courseOffering.updateMany({
      where: { id, deletedAt: null, enrolledCount: 0 },
      data: { deletedAt: new Date() },
    });
    if (count === 0) throw new AppError(409, "Cannot delete an offering that has enrolled students");
    await logActivity({ actorId, action: "OFFERING_DELETED", entity: "CourseOffering", entityId: id, ip }, tx);
  });
};

const myAssigned = async (teacherId: string, { page, limit, semester }: MyAssignedQuery) => {
  const where: Prisma.CourseOfferingWhereInput = { teacherId, deletedAt: null, ...(semester ? { semester } : {}) };

  const [rows, total] = await prisma.$transaction([
    prisma.courseOffering.findMany({ where, select, orderBy: { createdAt: "desc" }, ...getPagination(page, limit) }),
    prisma.courseOffering.count({ where }),
  ]);
  return { data: rows.map(withSeats), meta: buildMeta(page, limit, total) };
};

export const offeringService = { create, list, getById, assignTeacher, updateCapacity, remove, myAssigned };