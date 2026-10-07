import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

export interface AuditInput {
  actorId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  ip?: string | null;
}

// Pass `tx` to write the audit row inside the same transaction as the action itself.
export const logActivity = (input: AuditInput, db: Prisma.TransactionClient = prisma) =>
  db.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      before: input.before,
      after: input.after,
      ip: input.ip ?? null,
    },
  });