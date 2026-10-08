import { EnrollmentStatus, InvoiceStatus, PaymentStatus, UserStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";

const getStats = async () => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    usersByRole,
    suspendedUsers,
    newUsers,
    departments,
    courses,
    offerings,
    seats,
    activeEnrollments,
    revenue,
    pendingPayments,
    invoicesByStatus,
    topOfferings,
  ] = await Promise.all([
    prisma.user.groupBy({ by: ["role"], where: { deletedAt: null }, _count: { _all: true } }),
    prisma.user.count({ where: { deletedAt: null, status: UserStatus.SUSPENDED } }),
    prisma.user.count({ where: { deletedAt: null, createdAt: { gte: sevenDaysAgo } } }),
    prisma.department.count({ where: { deletedAt: null } }),
    prisma.course.count({ where: { deletedAt: null } }),
    prisma.courseOffering.count({ where: { deletedAt: null } }),
    prisma.courseOffering.aggregate({ where: { deletedAt: null }, _sum: { capacity: true, enrolledCount: true } }),
    prisma.enrollment.count({ where: { status: EnrollmentStatus.ENROLLED } }),
    prisma.payment.aggregate({ where: { status: PaymentStatus.SUCCESS }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.payment.count({ where: { status: PaymentStatus.PENDING } }),
    prisma.feeInvoice.groupBy({ by: ["status"], where: { deletedAt: null }, _count: { _all: true }, _sum: { amount: true } }),
    prisma.courseOffering.findMany({
      where: { deletedAt: null },
      orderBy: { enrolledCount: "desc" },
      take: 5,
      select: {
        id: true,
        semester: true,
        section: true,
        capacity: true,
        enrolledCount: true,
        course: { select: { code: true, title: true } },
      },
    }),
  ]);

  const byRole = { ADMIN: 0, TEACHER: 0, STUDENT: 0 };
  for (const row of usersByRole) byRole[row.role] = row._count._all;

  const invoices = { UNPAID: { count: 0, amount: "0" }, PAID: { count: 0, amount: "0" }, CANCELLED: { count: 0, amount: "0" } };
  for (const row of invoicesByStatus) {
    invoices[row.status as InvoiceStatus] = { count: row._count._all, amount: (row._sum.amount ?? 0).toString() };
  }

  const totalSeats = seats._sum.capacity ?? 0;
  const filledSeats = seats._sum.enrolledCount ?? 0;

  return {
    users: {
      total: byRole.ADMIN + byRole.TEACHER + byRole.STUDENT,
      byRole,
      suspended: suspendedUsers,
      joinedLast7Days: newUsers,
    },
    academics: {
      departments,
      courses,
      offerings,
      activeEnrollments,
      totalSeats,
      filledSeats,
      seatUtilizationPercent: totalSeats === 0 ? 0 : Math.round((filledSeats / totalSeats) * 10000) / 100,
    },
    finance: {
      revenue: (revenue._sum.amount ?? 0).toString(),
      successfulPayments: revenue._count._all,
      pendingPayments,
      invoices,
    },
    topOfferings,
  };
};

export const adminStatsService = { getStats };