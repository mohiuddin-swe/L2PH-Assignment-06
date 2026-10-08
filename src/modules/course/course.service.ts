import { Prisma } from "@prisma/client";
import { AppError } from "../../errors/AppError";
import { prisma } from "../../lib/prisma";
import { logActivity } from "../../utils/audit";
import { buildMeta, getPagination } from "../../utils/pagination";
import { CreateCourseInput, ListCoursesQuery, UpdateCourseInput } from "./course.validation";

const select = {
  id: true,
  code: true,
  title: true,
  description: true,
  credit: true,
  departmentId: true,
  createdAt: true,
  updatedAt: true,
  department: { select: { id: true, name: true, code: true } },
} satisfies Prisma.CourseSelect;

const snapshot = (c: { code: string; title: string; credit: number; departmentId: string }) => ({
  code: c.code,
  title: c.title,
  credit: c.credit,
  departmentId: c.departmentId,
});

const findActiveOrThrow = async (id: string) => {
  const course = await prisma.course.findFirst({ where: { id, deletedAt: null }, select });
  if (!course) throw new AppError(404, "Course not found");
  return course;
};

const assertDepartmentExists = async (departmentId: string) => {
  const department = await prisma.department.findFirst({ where: { id: departmentId, deletedAt: null }, select: { id: true } });
  if (!department) throw new AppError(404, "Department not found");
};

const create = async (input: CreateCourseInput, actorId: string, ip?: string) => {
  await assertDepartmentExists(input.departmentId);

  return prisma.$transaction(async (tx) => {
    const course = await tx.course.create({ data: input, select });
    await logActivity({ actorId, action: "COURSE_CREATED", entity: "Course", entityId: course.id, after: snapshot(course), ip }, tx);
    return course;
  });
};

const list = async (query: ListCoursesQuery) => {
  const { page, limit, q, departmentId, credit, sortBy, order } = query;

  const where: Prisma.CourseWhereInput = {
    deletedAt: null,
    ...(departmentId ? { departmentId } : {}),
    ...(credit ? { credit } : {}),
    ...(q
      ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] }
      : {}),
  };

  const [data, total] = await prisma.$transaction([
    prisma.course.findMany({
      where,
      select,
      orderBy: { [sortBy]: order } as Prisma.CourseOrderByWithRelationInput,
      ...getPagination(page, limit),
    }),
    prisma.course.count({ where }),
  ]);
  return { data, meta: buildMeta(page, limit, total) };
};

const getById = (id: string) => findActiveOrThrow(id);

const update = async (id: string, input: UpdateCourseInput, actorId: string, ip?: string) => {
  const before = await findActiveOrThrow(id);
  if (input.departmentId) await assertDepartmentExists(input.departmentId);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.course.update({ where: { id }, data: input, select });
    await logActivity(
      { actorId, action: "COURSE_UPDATED", entity: "Course", entityId: id, before: snapshot(before), after: snapshot(updated), ip },
      tx,
    );
    return updated;
  });
};

const remove = async (id: string, actorId: string, ip?: string) => {
  const course = await findActiveOrThrow(id);

  const activeOfferings = await prisma.courseOffering.count({ where: { courseId: id, deletedAt: null } });
  if (activeOfferings > 0) throw new AppError(409, "Cannot delete a course that still has active offerings");

  await prisma.$transaction(async (tx) => {
    await tx.course.update({ where: { id }, data: { deletedAt: new Date() } });
    await logActivity({ actorId, action: "COURSE_DELETED", entity: "Course", entityId: id, before: snapshot(course), ip }, tx);
  });
};

export const courseService = { create, list, getById, update, remove };