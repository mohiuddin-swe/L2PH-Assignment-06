import { InvoiceStatus, PaymentStatus, Prisma, Role, UserStatus } from "@prisma/client";
import { AppError } from "../../errors/AppError";
import { prisma } from "../../lib/prisma";
import { logActivity } from "../../utils/audit";
import { buildMeta, getPagination } from "../../utils/pagination";
import { CreateInvoiceInput, ListInvoicesQuery, MyInvoicesQuery } from "./invoice.validation";

const select = {
  id: true,
  title: true,
  semester: true,
  amount: true,
  currency: true,
  status: true,
  dueDate: true,
  createdAt: true,
  updatedAt: true,
  student: { select: { id: true, name: true, email: true } },
} satisfies Prisma.FeeInvoiceSelect;

const create = async (input: CreateInvoiceInput, actorId: string, ip?: string) => {
  const student = await prisma.user.findFirst({
    where: { id: input.studentId, role: Role.STUDENT, status: UserStatus.ACTIVE, deletedAt: null },
    select: { id: true },
  });
  if (!student) throw new AppError(404, "Student not found");

  return prisma.$transaction(async (tx) => {
    const invoice = await tx.feeInvoice.create({ data: input, select });
    await logActivity(
      {
        actorId,
        action: "INVOICE_CREATED",
        entity: "FeeInvoice",
        entityId: invoice.id,
        after: { studentId: input.studentId, title: input.title, semester: input.semester ?? null, amount: input.amount },
        ip,
      },
      tx,
    );
    return invoice;
  });
};

const list = async ({ page, limit, status, studentId, semester, q, sortBy, order }: ListInvoicesQuery) => {
  const where: Prisma.FeeInvoiceWhereInput = {
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(studentId ? { studentId } : {}),
    ...(semester ? { semester } : {}),
    ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
  };

  const [data, total] = await prisma.$transaction([
    prisma.feeInvoice.findMany({
      where,
      select,
      orderBy: { [sortBy]: order } as Prisma.FeeInvoiceOrderByWithRelationInput,
      ...getPagination(page, limit),
    }),
    prisma.feeInvoice.count({ where }),
  ]);
  return { data, meta: buildMeta(page, limit, total) };
};

const listMine = async (studentId: string, { page, limit, status, semester }: MyInvoicesQuery) => {
  const where: Prisma.FeeInvoiceWhereInput = {
    studentId,
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(semester ? { semester } : {}),
  };

  const [data, total] = await prisma.$transaction([
    prisma.feeInvoice.findMany({ where, select, orderBy: { createdAt: "desc" }, ...getPagination(page, limit) }),
    prisma.feeInvoice.count({ where }),
  ]);
  return { data, meta: buildMeta(page, limit, total) };
};

const getById = async (user: { id: string; role: Role }, id: string) => {
  // A student asking for someone else's invoice gets 404, so invoice ids cannot be probed.
  const invoice = await prisma.feeInvoice.findFirst({
    where: { id, deletedAt: null, ...(user.role === Role.STUDENT ? { studentId: user.id } : {}) },
    select: {
      ...select,
      payments: {
        select: { id: true, gateway: true, transactionId: true, amount: true, status: true, paidAt: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!invoice) throw new AppError(404, "Invoice not found");
  return invoice;
};

const cancel = async (id: string, actorId: string, ip?: string) => {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.feeInvoice.findFirst({ where: { id, deletedAt: null }, select: { id: true, status: true } });
    if (!invoice) throw new AppError(404, "Invoice not found");
    if (invoice.status !== InvoiceStatus.UNPAID) throw new AppError(409, "Only an unpaid invoice can be cancelled");

    // Money may be in flight or already received: refuse instead of orphaning a payment.
    const busy = await tx.payment.count({
      where: { invoiceId: id, status: { in: [PaymentStatus.PENDING, PaymentStatus.SUCCESS] } },
    });
    if (busy > 0) throw new AppError(409, "Cannot cancel an invoice that has a pending or successful payment");

    const { count } = await tx.feeInvoice.updateMany({
      where: { id, status: InvoiceStatus.UNPAID },
      data: { status: InvoiceStatus.CANCELLED },
    });
    if (count === 0) throw new AppError(409, "Only an unpaid invoice can be cancelled");

    await logActivity(
      { actorId, action: "INVOICE_CANCELLED", entity: "FeeInvoice", entityId: id, before: { status: "UNPAID" }, after: { status: "CANCELLED" }, ip },
      tx,
    );
    return tx.feeInvoice.findUniqueOrThrow({ where: { id }, select });
  });
};

export const invoiceService = { create, list, listMine, getById, cancel };