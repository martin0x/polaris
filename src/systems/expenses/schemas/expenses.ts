import { z } from "zod";

export const createTypeSchema = z.object({
  name: z.string().trim().min(1).max(40),
});

export const updateTypeSchema = z
  .object({
    name: z.string().trim().min(1).max(40).optional(),
    archived: z.boolean().optional(),
    position: z.number().int().min(0).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field required" });

export const listTypesQuerySchema = z.object({
  archived: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v === "true"),
});

export const createActivitySchema = z.object({
  typeId: z.string().min(1),
  title: z.string().trim().min(1).max(120).optional(),
});

export const updateActivitySchema = z
  .object({
    title: z.string().trim().max(120).nullable().optional(),
    typeId: z.string().min(1).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field required" });

export const listActivitiesQuerySchema = z.object({
  typeId: z.string().optional(),
  cursor: z.string().optional(),
  limit: z
    .string()
    .optional()
    .transform((v) => {
      const n = v ? parseInt(v, 10) : 50;
      return Number.isNaN(n) ? 50 : Math.min(Math.max(n, 1), 100);
    }),
});

export const putItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  amountCentavos: z.number().int().min(0).max(100_000_000),
  position: z.number().int().min(0),
});

export const trendsQuerySchema = z.object({
  months: z
    .enum(["3", "6", "12"])
    .optional()
    .transform((v) => (v ? (Number(v) as 3 | 6 | 12) : 6)),
});
