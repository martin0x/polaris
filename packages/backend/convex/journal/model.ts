import { ConvexError } from "convex/values";
import { extractTags, wordCount } from "@polaris/core/parser";
import { matchesAllTerms, searchTerms } from "@polaris/core/search";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

// Shared journal helpers — no Convex functions live in this file. Limits match
// the old Postgres journal's Zod route schemas (deleted; Task 13).

export const TOPIC_NAME_MAX = 80;
export const TOPIC_DESCRIPTION_MAX = 280;
// Topics are a small table; table-wide topic reads take at most this many.
export const TOPIC_SCAN_LIMIT = 1000;
// Read-time aggregate scans (topic stats, tag counts, the dashboard's recent
// window, the nightly job) read at most this many rows — far above personal
// scale, far below Convex's 32k-document read limit (decision log 5).
export const AGGREGATE_SCAN_LIMIT = 5000;

type Ctx = QueryCtx | MutationCtx;
export type TopicDoc = Doc<"journalTopics">;

export interface TopicDto {
  id: Id<"journalTopics">;
  name: string;
  description: string | null;
  archived: boolean;
}

export function topicDto(t: TopicDoc): TopicDto {
  return { id: t._id, name: t.name, description: t.description ?? null, archived: t.archived };
}

/** Case-insensitive name order. A plain comparison rather than localeCompare,
 *  which keeps Intl out of the Convex runtime. */
export function byName(a: { name: string }, b: { name: string }): number {
  const x = a.name.toLowerCase();
  const y = b.name.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
}

export function cleanTopicName(raw: string): string {
  const name = raw.trim();
  if (name.length < 1 || name.length > TOPIC_NAME_MAX) {
    throw new ConvexError(`Topic name must be 1-${TOPIC_NAME_MAX} characters`);
  }
  return name;
}

/** Trimmed description; an empty one becomes undefined (field removed). */
export function cleanDescription(raw: string): string | undefined {
  const description = raw.trim();
  if (description.length > TOPIC_DESCRIPTION_MAX) {
    throw new ConvexError(`Description must be at most ${TOPIC_DESCRIPTION_MAX} characters`);
  }
  return description.length > 0 ? description : undefined;
}

export async function topicByName(ctx: Ctx, name: string): Promise<TopicDoc | null> {
  return ctx.db
    .query("journalTopics")
    .withIndex("by_name", (q) => q.eq("name", name))
    .unique();
}

/** Inserts a topic; `name` must already be cleaned. Throws on a taken name. */
export async function insertTopic(
  ctx: MutationCtx,
  name: string,
  description?: string
): Promise<Id<"journalTopics">> {
  if ((await topicByName(ctx, name)) !== null) {
    throw new ConvexError(`Topic "${name}" already exists`);
  }
  const now = Date.now();
  return ctx.db.insert("journalTopics", {
    name,
    ...(description ? { description } : {}),
    archived: false,
    createdAt: now,
    updatedAt: now,
  });
}

export const ENTRY_TITLE_MAX = 200;
export const LIST_LIMIT_MAX = 100;

export type EntryDoc = Doc<"journalEntries">;

export interface EntryDto {
  id: Id<"journalEntries">;
  topicId: Id<"journalTopics">;
  topicName: string;
  title: string | null;
  body: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export function clampLimit(limit: number | undefined, fallback: number): number {
  return Math.min(Math.max(Math.trunc(limit ?? fallback), 1), LIST_LIMIT_MAX);
}

/** Trimmed title; null, undefined, or blank becomes undefined (no title). */
export function cleanTitle(raw: string | null | undefined): string | undefined {
  if (raw === null || raw === undefined) return undefined;
  const title = raw.trim();
  if (title.length > ENTRY_TITLE_MAX) {
    throw new ConvexError(`Titles can be at most ${ENTRY_TITLE_MAX} characters.`);
  }
  return title.length > 0 ? title : undefined;
}

export function checkBody(body: string): void {
  if (body.trim().length === 0) throw new ConvexError("Write something before saving.");
}

export function searchTextOf(title: string | undefined, body: string): string {
  return title ? `${title}\n${body}` : body;
}

/** Replaces an entry's tag rows. Pass [] to clear them (soft delete). */
export async function writeEntryTags(
  ctx: MutationCtx,
  entryId: Id<"journalEntries">,
  tags: string[],
  entryCreatedAt: number
): Promise<void> {
  const existing = await ctx.db
    .query("entryTags")
    .withIndex("by_entry", (q) => q.eq("entryId", entryId))
    .collect(); // one entry's tags
  for (const row of existing) await ctx.db.delete(row._id);
  for (const tag of tags) await ctx.db.insert("entryTags", { entryId, tag, entryCreatedAt });
}

// Metrics are scheduled so a failure can never fail or slow a journal write
// (docs/replatform.md §07).
export async function recordWordsMetric(ctx: MutationCtx, body: string): Promise<void> {
  await ctx.scheduler.runAfter(0, internal.feedback.record, {
    system: "journal",
    name: "words_per_entry",
    value: wordCount(body),
  });
}

/** The one way entries are created — journal's own create and habit logs
 *  (convex/journal/habitBridge.ts) both come through here. `title` must
 *  already be cleaned and `body` checked. */
export async function insertEntry(
  ctx: MutationCtx,
  input: { topicId: Id<"journalTopics">; title?: string; body: string; createdAt?: number }
): Promise<Id<"journalEntries">> {
  const createdAt = input.createdAt ?? Date.now();
  const tags = extractTags(input.body);
  const id = await ctx.db.insert("journalEntries", {
    topicId: input.topicId,
    ...(input.title ? { title: input.title } : {}),
    body: input.body,
    tags,
    searchText: searchTextOf(input.title, input.body),
    createdAt,
    updatedAt: createdAt, // a backdated habit log hasn't been edited either
  });
  await writeEntryTags(ctx, id, tags, createdAt);
  await ctx.scheduler.runAfter(0, internal.feedback.record, {
    system: "journal",
    name: "entry_created",
    value: 1,
  });
  await recordWordsMetric(ctx, input.body);
  return id;
}

export async function entryDtos(ctx: Ctx, docs: EntryDoc[]): Promise<EntryDto[]> {
  const names = new Map<Id<"journalTopics">, string>();
  const out: EntryDto[] = [];
  for (const e of docs) {
    if (!names.has(e.topicId)) {
      names.set(e.topicId, (await ctx.db.get(e.topicId))?.name ?? "(unknown topic)");
    }
    out.push({
      id: e._id,
      topicId: e.topicId,
      topicName: names.get(e.topicId)!,
      title: e.title ?? null,
      body: e.body,
      tags: e.tags,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    });
  }
  return out;
}

// Candidates pulled from the search index before the every-term filter
// (decision log 4, 19). Convex caps one search at 1024 results.
export const SEARCH_CANDIDATE_LIMIT = 256;
const MAX_SEARCH_TERMS = 16; // Convex search limit

/** Journal search: an empty query lists the newest live entries; otherwise
 *  index candidates (any term matches, relevance order) filtered down to
 *  entries containing every term, like the old Postgres tsquery AND. */
export async function searchEntryDocs(
  ctx: QueryCtx,
  args: { q: string; topicId?: Id<"journalTopics">; limit: number }
): Promise<EntryDoc[]> {
  const { topicId, limit } = args;
  if (args.q.trim().length === 0) {
    return topicId === undefined
      ? ctx.db
          .query("journalEntries")
          .withIndex("by_deleted_at_created_at", (q) => q.eq("deletedAt", undefined))
          .order("desc")
          .take(limit)
      : ctx.db
          .query("journalEntries")
          .withIndex("by_topic_deleted_at_created_at", (q) =>
            q.eq("topicId", topicId).eq("deletedAt", undefined)
          )
          .order("desc")
          .take(limit);
  }
  const terms = searchTerms(args.q).slice(0, MAX_SEARCH_TERMS);
  if (terms.length === 0) return [];
  const candidates = await ctx.db
    .query("journalEntries")
    .withSearchIndex("search_text", (s) => {
      const live = s.search("searchText", terms.join(" ")).eq("deletedAt", undefined);
      return topicId === undefined ? live : live.eq("topicId", topicId);
    })
    .take(SEARCH_CANDIDATE_LIMIT);
  return candidates.filter((e) => matchesAllTerms(e.searchText, terms)).slice(0, limit);
}

/** A habit's stored topic reference: a Convex id, or the Postgres cuid of a
 *  topic imported in phase 3 (resolved through legacyId). */
export async function resolveTopicRef(ctx: Ctx, ref: string): Promise<TopicDoc | null> {
  const id = ctx.db.normalizeId("journalTopics", ref);
  if (id !== null) return ctx.db.get(id);
  return ctx.db
    .query("journalTopics")
    .withIndex("by_legacy_id", (q) => q.eq("legacyId", ref))
    .unique();
}
