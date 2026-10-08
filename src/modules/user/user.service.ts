import { AppError } from "../../errors/AppError";
import { prisma } from "../../lib/prisma";
import { logActivity } from "../../utils/audit";
import { UpdateMeInput } from "./user.validation";

const meSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  status: true,
  authProvider: true,
  createdAt: true,
  studentProfile: { select: { studentId: true, department: { select: { id: true, name: true, code: true } } } },
  teacherProfile: { select: { designation: true, department: { select: { id: true, name: true, code: true } } } },
} as const;

const getMe = async (userId: string) => {
  const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null }, select: meSelect });
  if (!user) throw new AppError(404, "User not found");
  return user;
};

const updateMe = async (userId: string, input: UpdateMeInput, ip?: string) => {
  const before = await getMe(userId);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({ where: { id: userId }, data: input, select: meSelect });
    await logActivity(
      {
        actorId: userId,
        action: "USER_PROFILE_UPDATED",
        entity: "User",
        entityId: userId,
        before: { name: before.name, phone: before.phone },
        after: { name: updated.name, phone: updated.phone },
        ip,
      },
      tx,
    );
    return updated;
  });
};

export const userService = { getMe, updateMe };