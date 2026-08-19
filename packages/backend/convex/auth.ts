import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";
import { upsertAllowlistedUser } from "./lib/users";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Google],
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      return upsertAllowlistedUser(ctx, {
        existingUserId: args.existingUserId,
        profile: {
          email: args.profile.email as string | null | undefined,
          name: (args.profile as { name?: string | null }).name,
          image: (args.profile as { image?: string | null }).image,
        },
      });
    },
  },
});
