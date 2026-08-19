import { auth } from "./config";

export async function getSession() {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Unauthorized");
  }
  return session;
}

export async function getOptionalSession() {
  return auth();
}
