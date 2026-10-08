import { Prisma } from "@prisma/client";
import { AppError } from "../../errors/AppError";
import { prisma } from "../../lib/prisma";
import { logActivity } from "../../utils/audit";
import { buildMeta, getPagination } from "../../utils/pagination";
import { CreateDepartmentInput, ListDepartmentsQuery, UpdateDepartmentInput } from "./department.validation";

const select = {
  id: true,
  name: true,
  code: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { courses: { where: { deletedAt: null } } } },
} satisfies Prisma.DepartmentSelect;

const findActiveOrThrow = async (id: string) => {
  const department = await prisma.department.findFirst({ where: { id, deletedAt: null }, select });
  if (!department) throw new AppError(404, "Department not found");
  return department;
};

const create = (input: CreateDepartmentInput, actorId: string, ip?: string) =>
  prisma.$transaction(async (tx) => {
    const department = await tx.department.create({ data: input, select });
    await logActivity(
      { actorId, action: "DEPARTMENT_CREATED", entity: "Department", entityId: department.id, after: { name: department.name, code: department.code }, ip },
      tx,
    );
    return department;
  });

const list = async ({ page, limit, q }: ListDepartmentsQuery) => {
  const where: Prisma.DepartmentWhereInput = {
    deletedAt: null,
    ...(q
      ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] }
      : {}),
  };

  const [data, total] = await prisma.$transaction([
    prisma.department.findMany({ where, select, orderBy: { name: "asc" }, ...getPagination(page, limit) }),
    prisma.department.count({ where }),
  ]);
  return { data, meta: buildMeta(page, limit, total) };
};

const getById = (id: string) => findActiveOrThrow(id);

const update = async (id: string, input: UpdateDepartmentInput, actorId: string, ip?: string) => {
  const before = await findActiveOrThrow(id);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.department.update({ where: { id }, data: input, select });
    await logActivity(
      {
        actorId,
        action: "DEPARTMENT_UPDATED",
        entity: "Department",
        entityId: id,
        before: { name: before.name, code: before.code },
        after: { name: updated.name, code: updated.code },
        ip,
      },
      tx,
    );
    return updated;
  });
};

const remove = async (id: string, actorId: string, ip?: string) => {
  const department = await findActiveOrThrow(id);
  if (department._count.courses > 0) {
    throw new AppError(409, "Cannot delete a department that still has active courses");
  }

  await prisma.$transaction(async (tx) => {
    await tx.department.update({ where: { id }, data: { deletedAt: new Date() } });
    await logActivity(
      { actorId, action: "DEPARTMENT_DELETED", entity: "Department", entityId: id, before: { name: department.name, code: department.code }, ip },
      tx,
    );
  });
};

export const departmentService = { create, list, getById, update, remove };