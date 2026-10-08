import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { buildMeta, getPagination } from "../../utils/pagination";
import { AuditLogsQuery } from "./admin.validation";

const list = async ({ page, limit, actorId, entity, entityId, action, from, to }: AuditLogsQuery) => {
  const where: Prisma.AuditLogWhereInput = {
    ...(actorId ? { actorId } : {}),
    ...(entity ? { entity } : {}),
    ...(entityId ? { entityId } : {}),
    ...(action ? { action } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
  };

  const [data, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        before: true,
        after: true,
        ip: true,
        createdAt: true,
        actor: { select: { id: true, name: true, email: true, role: true } },
      },
      orderBy: { createdAt: "desc" },
      ...getPagination(page, limit),
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { data, meta: buildMeta(page, limit, total) };
};

export const adminAuditService = { list };