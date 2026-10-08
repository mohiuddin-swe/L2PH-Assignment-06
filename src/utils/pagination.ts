import { z } from "zod";

// Spread into any list-query schema: z.object({ ...paginationShape, q: ... })
export const paginationShape = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
};

export const getPagination = (page: number, limit: number) => ({ skip: (page - 1) * limit, take: limit });

export const buildMeta = (page: number, limit: number, total: number) => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit),
});