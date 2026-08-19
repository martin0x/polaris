import { defineSchema } from "convex/server";
import { authTables } from "@convex-dev/auth/server";

// authTables: users, authSessions, authAccounts, authRefreshTokens,
// authVerificationCodes, authVerifiers, authRateLimits.
// Feedback tables arrive in Task 6; system tables in phase 2.
export default defineSchema({
  ...authTables,
});
