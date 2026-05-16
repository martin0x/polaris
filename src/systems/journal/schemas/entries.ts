import { z } from "zod";

export const createEntrySchema = z.object({
  topicId: z.string().min(1),
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().min(1),
});

export const updateEntrySchema = z.object({
  topicId: z.string().min(1).optional(),
  title: z.string().trim().max(200).nullable().optional(),
  body: z.string().min(1).optional(),
});

export const listEntriesQuerySchema = z.object({
  topicId: z.string().optional(),
  tag: z.string().optional(),
  q: z.string().optional(),
  cursor: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.enum(["asc", "desc"]).optional(),
});

export type CreateEntryBody = z.infer<typeof createEntrySchema>;
export type UpdateEntryBody = z.infer<typeof updateEntrySchema>;
export type ListEntriesQuery = z.infer<typeof listEntriesQuerySchema>;
