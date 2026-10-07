import { NextFunction, Request, Response } from "express";
import { ZodTypeAny } from "zod";
import { AppError } from "../errors/AppError";

type Schemas = { body?: ZodTypeAny; query?: ZodTypeAny; params?: ZodTypeAny };

export const validate = (schemas: Schemas) => (req: Request, _res: Response, next: NextFunction) => {
  const errors: { field: string; message: string }[] = [];

  for (const key of ["body", "query", "params"] as const) {
    const schema = schemas[key];
    if (!schema) continue;

    const result = schema.safeParse(req[key]);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const path = key === "body" ? issue.path : [key, ...issue.path];
        errors.push({ field: path.join(".") || key, message: issue.message });
      }
    } else {
      (req as unknown as Record<string, unknown>)[key] = result.data;
    }
  }

  if (errors.length) return next(new AppError(400, "Validation failed", errors));
  next();
};