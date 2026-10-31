import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

// authTables: users, authSessions, authAccounts, authRefreshTokens,
// authVerificationCodes, authVerifiers, authRateLimits.
// Platform feedback (phase 1), expenses (phase 2), journal (phase 3).
export default defineSchema({
  ...authTables,

  // Platform: feedback. recordedAt/createdAt are ms since epoch (Prisma
  // DateTime → number); legacyId carries the Postgres cuid for idempotent import.
  systemMetrics: defineTable({
    system: v.string(),
    name: v.string(),
    value: v.number(),
    recordedAt: v.number(),
    legacyId: v.optional(v.string()),
  })
    .index("by_system", ["system"])
    .index("by_system_name", ["system", "name"])
    .index("by_recorded_at", ["recordedAt"])
    .index("by_legacy_id", ["legacyId"]),
  systemReflections: defineTable({
    system: v.string(),
    content: v.string(),
    strengths: v.array(v.string()),
    weaknesses: v.array(v.string()),
    ideas: v.array(v.string()),
    createdAt: v.number(),
    legacyId: v.optional(v.string()),
  })
    .index("by_system", ["system"])
    .index("by_created_at", ["createdAt"])
    .index("by_legacy_id", ["legacyId"]),
  systemIterations: defineTable({
    system: v.string(),
    description: v.string(),
    reason: v.string(),
    outcome: v.optional(v.string()),
    createdAt: v.number(),
    legacyId: v.optional(v.string()),
  })
    .index("by_system", ["system"])
    .index("by_created_at", ["createdAt"])
    .index("by_legacy_id", ["legacyId"]),

  // Expenses (phase 2). startedAt/createdAt/archivedAt are ms since epoch;
  // legacyId carries the Postgres cuid (items: the client-generated uuid).
  expenseActivityTypes: defineTable({
    name: v.string(),
    position: v.number(),
    archived: v.boolean(),
    archivedAt: v.optional(v.number()),
    createdAt: v.number(), // kept: ordering tie-break when positions collide
    legacyId: v.optional(v.string()),
  })
    .index("by_name", ["name"])
    .index("by_legacy_id", ["legacyId"]),
  expenseActivities: defineTable({
    typeId: v.id("expenseActivityTypes"),
    title: v.optional(v.string()),
    startedAt: v.number(),
    legacyId: v.optional(v.string()),
  })
    .index("by_type", ["typeId"]) // unqueried today; kept for future by-type views (mobile/phase 4+)
    .index("by_started_at", ["startedAt"])
    .index("by_legacy_id", ["legacyId"]),
  expenseItems: defineTable({
    activityId: v.id("expenseActivities"),
    // Client-generated uuid — the idempotent-upsert key for capture syncs.
    // For imported rows it equals legacyId (the old Prisma primary key).
    clientId: v.string(),
    name: v.string(),
    amountCentavos: v.number(),
    position: v.number(),
    legacyId: v.optional(v.string()),
  })
    .index("by_activity", ["activityId"])
    .index("by_client_id", ["clientId"])
    .index("by_legacy_id", ["legacyId"]),

  // Journal (phase 3). All timestamps are ms since epoch; legacyId carries the
  // Postgres cuid for idempotent import.
  journalTopics: defineTable({
    name: v.string(), // unique — enforced by the mutations through by_name
    description: v.optional(v.string()),
    parentId: v.optional(v.id("journalTopics")), // imported; nothing reads it yet
    archived: v.boolean(),
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(), // the palette lists recently changed topics first
    legacyId: v.optional(v.string()),
  })
    .index("by_name", ["name"])
    .index("by_legacy_id", ["legacyId"]),
  journalEntries: defineTable({
    topicId: v.id("journalTopics"),
    title: v.optional(v.string()),
    body: v.string(), // markdown
    tags: v.array(v.string()), // extractTags(body); entryTags mirrors it for live entries
    searchText: v.string(), // title + "\n" + body — the search index has one search field
    deletedAt: v.optional(v.number()), // soft delete
    createdAt: v.number(),
    updatedAt: v.number(),
    legacyId: v.optional(v.string()),
  })
    .index("by_deleted_at_created_at", ["deletedAt", "createdAt"])
    .index("by_topic_deleted_at_created_at", ["topicId", "deletedAt", "createdAt"])
    .index("by_legacy_id", ["legacyId"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["topicId", "deletedAt"],
    }),
  // One row per (live entry, tag). Soft-deleting an entry removes its rows.
  entryTags: defineTable({
    entryId: v.id("journalEntries"),
    tag: v.string(),
    entryCreatedAt: v.number(), // copy of the entry's createdAt — orders a tag's entries
  })
    .index("by_entry", ["entryId"])
    .index("by_tag_entry_created_at", ["tag", "entryCreatedAt"]),
});
