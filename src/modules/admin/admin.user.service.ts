import crypto from "crypto";
import bcrypt from "bcryptjs";
import { AuthProvider, EnrollmentStatus, Prisma, Role, UserStatus } from "@prisma/client";
import { env } from "../../config/env";
import { AppError } from "../../errors/AppError";
import { prisma } from "../../lib/prisma";
import { logActivity } from "../../utils/audit";
import { buildMeta, getPagination } from "../../utils/pagination";
import { CreateUserInput, ListUsersQuery } from "./admin.validation";

const select = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  status: true,
  authProvider: true,
  createdAt: true,
  updatedAt: true,
  studentProfile: { select: { studentId: true, department: { select: { id: true, name: true, code: true } } } },
  teacherProfile: { select: { designation: true, department: { select: { id: true, name: true, code: true } } } },
} satisfies Prisma.UserSelect;

const generateStudentId = () => `STU-${new Date().getFullYear()}-${crypto.randomInt(100000, 999999)}`;

const findActiveOrThrow = async (id: string) => {
  const user = await prisma.user.findFirst({ where: { id, deletedAt: null }, select });
  if (!user) throw new AppError(404, "User not found");
  return user;
};

// The system must always keep at least one active admin, otherwise nobody can manage it.
const assertAnotherActiveAdmin = async (tx: Prisma.TransactionClient, excludeUserId: string) => {
  const others = await tx.user.count({
    where: { role: Role.ADMIN, status: UserStatus.ACTIVE, deletedAt: null, id: { not: excludeUserId } },
  });
  if (others === 0) throw new AppError(409, "You cannot remove the last active admin");
};

// A teacher who still teaches, or a student who is still enrolled, cannot be moved out of that role or deleted.
const assertNoActiveWork = async (tx: Prisma.TransactionClient, user: { id: string; role: Role }) => {
  if (user.role === Role.TEACHER) {
    const offerings = await tx.courseOffering.count({ where: { teacherId: user.id, deletedAt: null } });
    if (offerings > 0) throw new AppError(409, "This teacher still has active course offerings. Reassign them first");
  }
  if (user.role === Role.STUDENT) {
    const enrollments = await tx.enrollment.count({ where: { studentId: user.id, status: EnrollmentStatus.ENROLLED } });
    if (enrollments > 0) throw new AppError(409, "This student still has active enrollments");
  }
};

const revokeSessions = (tx: Prisma.TransactionClient, userId: string) =>
  tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });

const create = async (input: CreateUserInput, actorId: string, ip?: string) => {
  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) throw new AppError(409, "Email is already registered");

  if (input.departmentId) {
    const dept = await prisma.department.findFirst({ where: { id: input.departmentId, deletedAt: null }, select: { id: true } });
    if (!dept) throw new AppError(404, "Department not found");
  }

  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);

  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          phone: input.phone,
          passwordHash,
          role: input.role,
          authProvider: AuthProvider.LOCAL,
          ...(input.role === Role.STUDENT
            ? { studentProfile: { create: { studentId: generateStudentId(), departmentId: input.departmentId } } }
            : {}),
          ...(input.role === Role.TEACHER
            ? { teacherProfile: { create: { designation: input.designation, departmentId: input.departmentId } } }
            : {}),
        },
        select,
      });
      await logActivity(
        { actorId, action: "USER_CREATED_BY_ADMIN", entity: "User", entityId: user.id, after: { email: user.email, role: user.role }, ip },
        tx,
      );
      return user;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(409, "Email is already registered");
    }
    throw err;
  }
};

const list = async ({ page, limit, role, status, q, sortBy, order }: ListUsersQuery) => {
  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    ...(role ? { role } : {}),
    ...(status ? { status } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {}),
  };

  const [data, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select,
      orderBy: { [sortBy]: order } as Prisma.UserOrderByWithRelationInput,
      ...getPagination(page, limit),
    }),
    prisma.user.count({ where }),
  ]);
  return { data, meta: buildMeta(page, limit, total) };
};

const getById = (id: string) => findActiveOrThrow(id);

const changeRole = async (actorId: string, id: string, role: Role, ip?: string) => {
  if (id === actorId) throw new AppError(409, "You cannot change your own role");
  const target = await findActiveOrThrow(id);
  if (target.role === role) throw new AppError(409, `User already has the ${role} role`);

  return prisma.$transaction(async (tx) => {
    if (target.role === Role.ADMIN) await assertAnotherActiveAdmin(tx, id);
    await assertNoActiveWork(tx, target);

    await tx.user.update({ where: { id }, data: { role } });
    // Make sure the new role has the profile row it needs.
    if (role === Role.TEACHER) await tx.teacherProfile.upsert({ where: { userId: id }, update: {}, create: { userId: id } });
    if (role === Role.STUDENT) {
      await tx.studentProfile.upsert({ where: { userId: id }, update: {}, create: { userId: id, studentId: generateStudentId() } });
    }
    await revokeSessions(tx, id); // force a fresh login with the new role

    await logActivity(
      { actorId, action: "USER_ROLE_CHANGED", entity: "User", entityId: id, before: { role: target.role }, after: { role }, ip },
      tx,
    );
    return tx.user.findUniqueOrThrow({ where: { id }, select });
  });
};

const changeStatus = async (actorId: string, id: string, status: UserStatus, ip?: string) => {
  if (id === actorId) throw new AppError(409, "You cannot change your own status");
  const target = await findActiveOrThrow(id);
  if (target.status === status) throw new AppError(409, `User is already ${status.toLowerCase()}`);

  return prisma.$transaction(async (tx) => {
    if (status === UserStatus.SUSPENDED) {
      if (target.role === Role.ADMIN) await assertAnotherActiveAdmin(tx, id);
      await revokeSessions(tx, id);
    }
    await tx.user.update({ where: { id }, data: { status } });
    await logActivity(
      { actorId, action: "USER_STATUS_CHANGED", entity: "User", entityId: id, before: { status: target.status }, after: { status }, ip },
      tx,
    );
    return tx.user.findUniqueOrThrow({ where: { id }, select });
  });
};

const remove = async (actorId: string, id: string, ip?: string) => {
  if (id === actorId) throw new AppError(409, "You cannot delete your own account");
  const target = await findActiveOrThrow(id);

  await prisma.$transaction(async (tx) => {
    if (target.role === Role.ADMIN) await assertAnotherActiveAdmin(tx, id);
    await assertNoActiveWork(tx, target);

    await tx.user.update({ where: { id }, data: { deletedAt: new Date() } });
    await revokeSessions(tx, id);
    await logActivity(
      { actorId, action: "USER_DELETED", entity: "User", entityId: id, before: { email: target.email, role: target.role }, ip },
      tx,
    );
  });
};

export const adminUserService = { create, list, getById, changeRole, changeStatus, remove };