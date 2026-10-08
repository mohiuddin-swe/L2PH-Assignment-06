import { Prisma, Role } from "@prisma/client";
import { AppError } from "../../errors/AppError";
import { prisma } from "../../lib/prisma";
import { logActivity } from "../../utils/audit";
import { buildMeta, getPagination } from "../../utils/pagination";
import { CreateNoticeInput, ListNoticesQuery, UpdateNoticeInput } from "./notice.validation";

const select = {
  id: true,
  title: true,
  content: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, name: true, role: true } },
} satisfies Prisma.NoticeSelect;

const findActiveOrThrow = async (id: string) => {
  const notice = await prisma.notice.findFirst({ where: { id, deletedAt: null }, select: { ...select, authorId: true } });
  if (!notice) throw new AppError(404, "Notice not found");
  return notice;
};

// Admin can manage every notice, a teacher only the ones they wrote.
const assertCanManage = (user: { id: string; role: Role }, notice: { authorId: string }) => {
  if (user.role !== Role.ADMIN && notice.authorId !== user.id) {
    throw new AppError(403, "You can only manage your own notices");
  }
};

const create = (user: { id: string }, input: CreateNoticeInput, ip?: string) =>
  prisma.$transaction(async (tx) => {
    const notice = await tx.notice.create({ data: { ...input, authorId: user.id }, select });
    await logActivity({ actorId: user.id, action: "NOTICE_CREATED", entity: "Notice", entityId: notice.id, after: { title: notice.title }, ip }, tx);
    return notice;
  });

const list = async ({ page, limit, q, sortBy, order }: ListNoticesQuery) => {
  const where: Prisma.NoticeWhereInput = {
    deletedAt: null,
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { content: { contains: q, mode: "insensitive" } }] } : {}),
  };

  const [data, total] = await prisma.$transaction([
    prisma.notice.findMany({
      where,
      select,
      orderBy: { [sortBy]: order } as Prisma.NoticeOrderByWithRelationInput,
      ...getPagination(page, limit),
    }),
    prisma.notice.count({ where }),
  ]);
  return { data, meta: buildMeta(page, limit, total) };
};

const getById = async (id: string) => {
  const { authorId: _authorId, ...notice } = await findActiveOrThrow(id);
  return notice;
};

const update = async (user: { id: string; role: Role }, id: string, input: UpdateNoticeInput, ip?: string) => {
  const before = await findActiveOrThrow(id);
  assertCanManage(user, before);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.notice.update({ where: { id }, data: input, select });
    await logActivity(
      { actorId: user.id, action: "NOTICE_UPDATED", entity: "Notice", entityId: id, before: { title: before.title }, after: { title: updated.title }, ip },
      tx,
    );
    return updated;
  });
};

const remove = async (user: { id: string; role: Role }, id: string, ip?: string) => {
  const notice = await findActiveOrThrow(id);
  assertCanManage(user, notice);

  await prisma.$transaction(async (tx) => {
    await tx.notice.update({ where: { id }, data: { deletedAt: new Date() } });
    await logActivity({ actorId: user.id, action: "NOTICE_DELETED", entity: "Notice", entityId: id, before: { title: notice.title }, ip }, tx);
  });
};

export const noticeService = { create, list, getById, update, remove };