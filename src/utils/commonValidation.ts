import { z } from "zod";

export const idParamSchema = z.object({ id: z.string().uuid("Invalid id format") });

export const nonEmptyBody = (data: object) => Object.keys(data).length > 0;