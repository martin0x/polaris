import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { isEmailAllowed } from "./allowlist";

export type OAuthProfile = {
  email?: string | null;
  name?: string | null;
  image?: string | null;
};

// The Convex Auth user-creation callback body. Throwing here aborts the
// auth:store transaction, which denies the sign-in — the allowlist gate.
export async function upsertAllowlistedUser(
  ctx: MutationCtx,
  args: { existingUserId: Id<"users"> | null; profile: OAuthProfile },
): Promise<Id<"users">> {
  const email = args.profile.email ?? null;
  if (!isEmailAllowed(email, process.env.ALLOWED_EMAILS)) {
    throw new ConvexError("Email is not on the allowlist");
  }
  const patch = {
    email: email!,
    name: args.profile.name ?? undefined,
    image: args.profile.image ?? undefined,
  };
  if (args.existingUserId !== null) {
    await ctx.db.patch(args.existingUserId, patch);
    return args.existingUserId;
  }
  const existing = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email!))
    .unique();
  if (existing !== null) {
    await ctx.db.patch(existing._id, patch);
    return existing._id;
  }
  return await ctx.db.insert("users", patch);
}
