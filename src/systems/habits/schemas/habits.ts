import { z } from "zod";

export const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected yyyy-mm-dd");

export const createHabitSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const updateHabitSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    quote: z.string().trim().max(500).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field required" });

export const reorderSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

export const tickBodySchema = z.object({
  status: z.enum(["PARTIAL", "COMPLETE"]),
});

export const weekQuerySchema = z.object({ start: dateStringSchema });
export const detailQuerySchema = z.object({ week: dateStringSchema });
