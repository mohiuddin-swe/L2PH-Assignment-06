import "dotenv/config";
import bcrypt from "bcryptjs";
import { AuthProvider, PrismaClient, Role, UserStatus } from "@prisma/client";

const prisma = new PrismaClient();

const accounts = [
  {
    name: "System Admin",
    role: Role.ADMIN,
    email: process.env.SEED_ADMIN_EMAIL ?? "admin@ums.test",
    password: process.env.SEED_ADMIN_PASSWORD ?? "Admin@12345",
  },
  {
    name: "Demo Teacher",
    role: Role.TEACHER,
    email: process.env.SEED_TEACHER_EMAIL ?? "teacher@ums.test",
    password: process.env.SEED_TEACHER_PASSWORD ?? "Teacher@12345",
  },
  {
    name: "Demo Student",
    role: Role.STUDENT,
    email: process.env.SEED_STUDENT_EMAIL ?? "student@ums.test",
    password: process.env.SEED_STUDENT_PASSWORD ?? "Student@12345",
  },
];

async function main() {
  const department = await prisma.department.upsert({
    where: { code: "CSE" },
    update: {},
    create: { name: "Computer Science & Engineering", code: "CSE" },
  });

  for (const account of accounts) {
    const passwordHash = await bcrypt.hash(account.password, 10);

    const user = await prisma.user.upsert({
      where: { email: account.email },
      update: { passwordHash, role: account.role, status: UserStatus.ACTIVE, deletedAt: null },
      create: {
        name: account.name,
        email: account.email,
        passwordHash,
        role: account.role,
        authProvider: AuthProvider.LOCAL,
      },
    });

    if (account.role === Role.TEACHER) {
      await prisma.teacherProfile.upsert({
        where: { userId: user.id },
        update: {},
        create: { userId: user.id, designation: "Lecturer", departmentId: department.id },
      });
    }
    if (account.role === Role.STUDENT) {
      await prisma.studentProfile.upsert({
        where: { userId: user.id },
        update: {},
        create: { userId: user.id, studentId: "STU-DEMO-0001", departmentId: department.id },
      });
    }
    console.log(`Seeded ${account.role}: ${account.email}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());