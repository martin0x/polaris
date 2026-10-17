import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/** Single-user system: "signed in?" is the whole gate — the allowlist already
 *  ran when the account was created (convex/auth.ts). */
export async function assertSignedIn(ctx: QueryCtx | MutationCtx): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) throw new ConvexError("Unauthorized");
}
