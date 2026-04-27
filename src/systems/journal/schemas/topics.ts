import { z } from "zod";

export const createTopicSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(280).optional(),
});

export const updateTopicSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(280).nullable().optional(),
    archived: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field required" });

export const listTopicsQuerySchema = z.object({
  archived: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v === "true"),
});

export type CreateTopicBody = z.infer<typeof createTopicSchema>;
export type UpdateTopicBody = z.infer<typeof updateTopicSchema>;
