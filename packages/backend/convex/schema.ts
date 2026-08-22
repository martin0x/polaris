import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

// authTables: users, authSessions, authAccounts, authRefreshTokens,
// authVerificationCodes, authVerifiers, authRateLimits.
// Feedback tables added in Task 6; system tables in phase 2.
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
    .index("by_type", ["typeId"])
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
});
