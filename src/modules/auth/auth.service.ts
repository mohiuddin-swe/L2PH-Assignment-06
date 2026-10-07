import crypto from "crypto";
import bcrypt from "bcryptjs";
import { AuthProvider, Prisma, Role, UserStatus } from "@prisma/client";
import { env } from "../../config/env";
import { AppError } from "../../errors/AppError";
import { prisma } from "../../lib/prisma";
import { logActivity } from "../../utils/audit";
import { generateRefreshToken, hashToken, signAccessToken } from "../../utils/token";
import { LoginInput, RegisterInput } from "./auth.validation";

const publicUserSelect = { id: true, name: true, email: true, role: true } satisfies Prisma.UserSelect;

// Compared against when the email does not exist, so response time does not reveal valid emails.
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", env.BCRYPT_ROUNDS);

const generateStudentId = () => `STU-${new Date().getFullYear()}-${crypto.randomInt(100000, 999999)}`;

const issueTokens = async (user: { id: string; role: Role }, db: Prisma.TransactionClient = prisma) => {
  const refreshToken = generateRefreshToken();
  await db.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  return { accessToken: signAccessToken(user.id, user.role), refreshToken };
};

const register = async (input: RegisterInput, ip?: string) => {
  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) throw new AppError(409, "Email is already registered");

  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        passwordHash,
        role: Role.STUDENT, // public registration can only ever create students
        authProvider: AuthProvider.LOCAL,
        studentProfile: { create: { studentId: generateStudentId() } },
      },
      select: publicUserSelect,
    });
    const tokens = await issueTokens(user, tx);
    await logActivity(
      { actorId: user.id, action: "USER_REGISTERED", entity: "User", entityId: user.id, after: { email: user.email, role: user.role }, ip },
      tx,
    );
    return { user, ...tokens };
  });
};

const login = async (input: LoginInput, ip?: string) => {
  const user = await prisma.user.findFirst({
    where: { email: input.email, deletedAt: null },
    select: { ...publicUserSelect, passwordHash: true, status: true },
  });

  const valid = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !user.passwordHash || !valid) throw new AppError(401, "Invalid email or password");
  if (user.status !== UserStatus.ACTIVE) {
    throw new AppError(403, "Your account is suspended. Please contact the administrator.");
  }

  const tokens = await issueTokens(user);
  await logActivity({ actorId: user.id, action: "USER_LOGIN", entity: "User", entityId: user.id, ip });

  return { user: { id: user.id, name: user.name, email: user.email, role: user.role }, ...tokens };
};

const refresh = async (token: string) => {
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, role: true, status: true, deletedAt: true } } },
  });
  if (!stored) throw new AppError(401, "Invalid refresh token");

  // A revoked token being presented again means it was probably stolen: kill every session.
  if (stored.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new AppError(401, "Refresh token reuse detected. Please log in again.");
  }
  if (stored.expiresAt < new Date()) throw new AppError(401, "Refresh token expired");
  if (stored.user.deletedAt || stored.user.status !== UserStatus.ACTIVE) {
    throw new AppError(403, "Account is not active");
  }

  return prisma.$transaction(async (tx) => {
    // Conditional update: if two requests race with the same token, only one can win.
    const { count } = await tx.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) throw new AppError(401, "Invalid refresh token");
    return issueTokens(stored.user, tx);
  });
};

const logout = async (token: string) => {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
};

interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
}

const googleLogin = async (profile: GoogleProfile, ip?: string) => {
  const select = { ...publicUserSelect, status: true, googleId: true } satisfies Prisma.UserSelect;

  let user = await prisma.user.findFirst({ where: { googleId: profile.googleId, deletedAt: null }, select });

  if (!user) {
    const byEmail = await prisma.user.findFirst({ where: { email: profile.email, deletedAt: null }, select });
    if (byEmail) {
      if (byEmail.googleId && byEmail.googleId !== profile.googleId) {
        throw new AppError(409, "This email is linked to a different Google account");
      }
      // Google verified this email, so it is safe to link the existing account.
      user = await prisma.user.update({ where: { id: byEmail.id }, data: { googleId: profile.googleId }, select });
    } else {
      user = await prisma.user.create({
        data: {
          name: profile.name,
          email: profile.email,
          googleId: profile.googleId,
          role: Role.STUDENT,
          authProvider: AuthProvider.GOOGLE,
          studentProfile: { create: { studentId: generateStudentId() } },
        },
        select,
      });
    }
  }

  if (user.status !== UserStatus.ACTIVE) {
    throw new AppError(403, "Your account is suspended. Please contact the administrator.");
  }

  const tokens = await issueTokens(user);
  await logActivity({ actorId: user.id, action: "USER_GOOGLE_LOGIN", entity: "User", entityId: user.id, ip });

  return { user: { id: user.id, name: user.name, email: user.email, role: user.role }, ...tokens };
};

export const authService = { register, login, refresh, logout, googleLogin };