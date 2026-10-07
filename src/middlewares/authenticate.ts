import { Role, UserStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../errors/AppError";
import { catchAsync } from "../utils/catchAsync";
import { verifyAccessToken } from "../utils/token";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; role: Role };
    }
  }
}

export const authenticate = catchAsync(async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw new AppError(401, "Authentication required");

  let payload: { sub: string; role: Role };
  try {
    payload = verifyAccessToken(header.slice(7));
  } catch {
    throw new AppError(401, "Invalid or expired token");
  }

  // Always re-check the DB so role changes, suspension and soft-delete take effect immediately.
  const user = await prisma.user.findFirst({
    where: { id: payload.sub, deletedAt: null },
    select: { id: true, role: true, status: true },
  });
  if (!user) throw new AppError(401, "Invalid or expired token");
  if (user.status !== UserStatus.ACTIVE) throw new AppError(403, "Your account is suspended");

  req.user = { id: user.id, role: user.role };
  next();
});