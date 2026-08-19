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
});
