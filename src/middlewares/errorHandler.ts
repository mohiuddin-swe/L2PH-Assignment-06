import { ErrorRequestHandler } from "express";
import { JsonWebTokenError } from "jsonwebtoken";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { AppError } from "../errors/AppError";
import { isProd } from "../config/env";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let statusCode = 500;
  let message = "Internal server error";
  let errors: unknown[] = [];

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    errors = err.errors;
  } else if (err instanceof ZodError) {
    statusCode = 400;
    message = "Validation failed";
    errors = err.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      statusCode = 409;
      message = "A record with this value already exists";
      errors = [{ field: String(err.meta?.target ?? ""), message: "Must be unique" }];
    } else if (err.code === "P2025") {
      statusCode = 404;
      message = "Record not found";
    } else if (err.code === "P2003") {
      statusCode = 400;
      message = "Invalid reference to a related record";
    }
  } else if (err instanceof JsonWebTokenError) {
    statusCode = 401;
    message = "Invalid or expired token";
  } else if (err instanceof SyntaxError && "body" in err) {
    statusCode = 400;
    message = "Malformed JSON body";
  }

  if (statusCode === 500) {
    console.error(err);
    if (!isProd && err instanceof Error) message = err.message;
  }

  res.status(statusCode).json({ success: false, message, errors });
};