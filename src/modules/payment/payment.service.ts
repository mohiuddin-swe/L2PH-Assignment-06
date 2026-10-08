import { randomBytes } from "crypto";
import { InvoiceStatus, PaymentGateway, PaymentStatus, Prisma, Role } from "@prisma/client";
import { AppError } from "../../errors/AppError";
import { prisma } from "../../lib/prisma";
import { logActivity } from "../../utils/audit";
import { buildMeta, getPagination } from "../../utils/pagination";
import { createSession, isGatewayConfigured, validatePayment } from "./sslcommerz";
import { ListPaymentsQuery, MyPaymentsQuery } from "./payment.validation";

const select = {
  id: true,
  invoiceId: true,
  gateway: true,
  transactionId: true,
  amount: true,
  currency: true,
  status: true,
  paidAt: true,
  createdAt: true,
  invoice: { select: { id: true, title: true, semester: true } },
} satisfies Prisma.PaymentSelect;

// ---------- student starts a payment ----------
const initiate = async (user: { id: string }, invoiceId: string, ip?: string) => {
  if (!isGatewayConfigured()) throw new AppError(503, "Payment gateway is not configured on this server");

  const invoice = await prisma.feeInvoice.findFirst({
    where: { id: invoiceId, studentId: user.id, deletedAt: null },
    select: { id: true, title: true, amount: true, currency: true, status: true, student: { select: { name: true, email: true, phone: true } } },
  });
  if (!invoice) throw new AppError(404, "Invoice not found");
  if (invoice.status !== InvoiceStatus.UNPAID) throw new AppError(409, `This invoice is already ${invoice.status.toLowerCase()}`);

  const tranId = `UMS-${Date.now()}-${randomBytes(4).toString("hex")}`;

  // A new attempt supersedes older unfinished ones, so only one payment per invoice can be PENDING.
  const payment = await prisma.$transaction(async (tx) => {
    await tx.payment.updateMany({
      where: { invoiceId, status: PaymentStatus.PENDING },
      data: { status: PaymentStatus.CANCELLED },
    });
    const created = await tx.payment.create({
      data: {
        invoiceId,
        userId: user.id,
        gateway: PaymentGateway.SSLCOMMERZ,
        transactionId: tranId,
        amount: invoice.amount,
        currency: invoice.currency,
      },
      select: { id: true },
    });
    await logActivity(
      { actorId: user.id, action: "PAYMENT_INITIATED", entity: "Payment", entityId: created.id, after: { invoiceId, transactionId: tranId }, ip },
      tx,
    );
    return created;
  });

  try {
    const session = await createSession({
      tranId,
      amount: invoice.amount.toFixed(2),
      currency: invoice.currency,
      productName: invoice.title,
      customer: invoice.student,
    });
    return {
      paymentId: payment.id,
      transactionId: tranId,
      amount: invoice.amount,
      currency: invoice.currency,
      gatewayUrl: session.gatewayUrl,
    };
  } catch (err) {
    await prisma.payment.updateMany({ where: { id: payment.id, status: PaymentStatus.PENDING }, data: { status: PaymentStatus.FAILED } });
    throw err;
  }
};

// ---------- gateway callbacks (public routes, so nothing in them is trusted) ----------
type CallbackBody = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : undefined);

const findByTranId = async (tranId: string | undefined) => {
  if (!tranId) throw new AppError(400, "tran_id is required");
  const payment = await prisma.payment.findUnique({
    where: { transactionId: tranId },
    select: { id: true, invoiceId: true, userId: true, amount: true, currency: true, status: true, transactionId: true },
  });
  if (!payment) throw new AppError(404, "Payment not found");
  return payment;
};

// Success redirect and IPN both end up here. Safe to call many times: only the first call flips the state.
const settle = async (body: CallbackBody, ip?: string) => {
  const payment = await findByTranId(str(body.tran_id));
  if (payment.status === PaymentStatus.SUCCESS) {
    return { transactionId: payment.transactionId, invoiceId: payment.invoiceId, status: payment.status, alreadyProcessed: true };
  }
  if (payment.status !== PaymentStatus.PENDING) {
    throw new AppError(409, `This payment is already ${payment.status.toLowerCase()}`);
  }

  const valId = str(body.val_id);
  if (!valId) throw new AppError(400, "val_id is required");

  // Server-to-server check with the gateway. A forged callback has no valid val_id and stops here.
  const check = await validatePayment(valId);
  const statusOk = check.status === "VALID" || check.status === "VALIDATED";
  if (!statusOk || check.tran_id !== payment.transactionId) {
    throw new AppError(400, "Payment could not be verified with the gateway");
  }

  // The gateway reply is external data: parse the amount defensively so garbage can never become a 500.
  let amountMatches = false;
  try {
    amountMatches = new Prisma.Decimal(String(check.currency_amount ?? check.amount ?? "")).equals(payment.amount);
  } catch {
    amountMatches = false;
  }
  if (!amountMatches) throw new AppError(400, "Payment could not be verified with the gateway");

  const done = await prisma.$transaction(async (tx) => {
    const { count } = await tx.payment.updateMany({
      where: { id: payment.id, status: PaymentStatus.PENDING },
      data: { status: PaymentStatus.SUCCESS, paidAt: new Date(), rawPayload: check as Prisma.InputJsonObject },
    });
    if (count === 0) return false; // another request (IPN vs redirect) won the race

    await tx.feeInvoice.updateMany({
      where: { id: payment.invoiceId, status: InvoiceStatus.UNPAID },
      data: { status: InvoiceStatus.PAID },
    });
    await logActivity(
      {
        actorId: payment.userId,
        action: "PAYMENT_SUCCESS",
        entity: "Payment",
        entityId: payment.id,
        after: { transactionId: payment.transactionId, amount: payment.amount.toString() },
        ip,
      },
      tx,
    );
    return true;
  });

  return { transactionId: payment.transactionId, invoiceId: payment.invoiceId, status: PaymentStatus.SUCCESS, alreadyProcessed: !done };
};

const closeUnfinished = async (body: CallbackBody, status: "FAILED" | "CANCELLED", ip?: string) => {
  const payment = await findByTranId(str(body.tran_id));

  const changed = await prisma.$transaction(async (tx) => {
    // Only a PENDING payment can move to FAILED/CANCELLED. A SUCCESS payment can never be undone by a callback.
    const { count } = await tx.payment.updateMany({
      where: { id: payment.id, status: PaymentStatus.PENDING },
      data: { status },
    });
    if (count === 1) {
      await logActivity(
        { actorId: payment.userId, action: `PAYMENT_${status}`, entity: "Payment", entityId: payment.id, after: { transactionId: payment.transactionId }, ip },
        tx,
      );
    }
    return count === 1;
  });

  const current = changed ? status : (await prisma.payment.findUniqueOrThrow({ where: { id: payment.id }, select: { status: true } })).status;
  return { transactionId: payment.transactionId, invoiceId: payment.invoiceId, status: current };
};

const handleIpn = async (body: CallbackBody, ip?: string) => {
  const status = str(body.status);
  if (status === "VALID" || status === "VALIDATED") return settle(body, ip);
  if (status === "CANCELLED") return closeUnfinished(body, "CANCELLED", ip);
  return closeUnfinished(body, "FAILED", ip);
};

// ---------- reads ----------
const listMine = async (userId: string, { page, limit, status }: MyPaymentsQuery) => {
  const where: Prisma.PaymentWhereInput = { userId, ...(status ? { status } : {}) };
  const [data, total] = await prisma.$transaction([
    prisma.payment.findMany({ where, select, orderBy: { createdAt: "desc" }, ...getPagination(page, limit) }),
    prisma.payment.count({ where }),
  ]);
  return { data, meta: buildMeta(page, limit, total) };
};

const list = async ({ page, limit, status, gateway, userId, invoiceId }: ListPaymentsQuery) => {
  const where: Prisma.PaymentWhereInput = {
    ...(status ? { status } : {}),
    ...(gateway ? { gateway } : {}),
    ...(userId ? { userId } : {}),
    ...(invoiceId ? { invoiceId } : {}),
  };
  const [data, total] = await prisma.$transaction([
    prisma.payment.findMany({
      where,
      select: { ...select, user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      ...getPagination(page, limit),
    }),
    prisma.payment.count({ where }),
  ]);
  return { data, meta: buildMeta(page, limit, total) };
};

const getById = async (user: { id: string; role: Role }, id: string) => {
  const payment = await prisma.payment.findFirst({
    where: { id, ...(user.role === Role.STUDENT ? { userId: user.id } : {}) },
    select,
  });
  if (!payment) throw new AppError(404, "Payment not found");
  return payment;
};

export const paymentService = { initiate, settle, closeUnfinished, handleIpn, listMine, list, getById };