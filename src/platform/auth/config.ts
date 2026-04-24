import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/platform/db/client";
import { authConfig } from "./auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma 7 type incompatibility with @auth/prisma-adapter
  adapter: PrismaAdapter(prisma as any),
});
