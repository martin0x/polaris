import { convexTest } from "convex-test";
import { beforeEach, expect, test } from "vitest";
import schema from "../convex/schema";
import { upsertAllowlistedUser } from "../convex/lib/users";
import { api } from "../convex/_generated/api";

const modules = import.meta.glob("../convex/**/*.*s");

beforeEach(() => {
  process.env.ALLOWED_EMAILS = "ray@example.com, partner@example.com";
});

test("rejects an email not on the allowlist", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.run(async (ctx) =>
      upsertAllowlistedUser(ctx, {
        existingUserId: null,
        profile: { email: "intruder@example.com", name: "Intruder", image: null },
      }),
    ),
  ).rejects.toThrow();
});

test("creates a user for an allowlisted email", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run(async (ctx) =>
    upsertAllowlistedUser(ctx, {
      existingUserId: null,
      profile: { email: "ray@example.com", name: "Ray", image: null },
    }),
  );
  const user = await t.run(async (ctx) => ctx.db.get(userId));
  expect(user?.email).toBe("ray@example.com");
  expect(user?.name).toBe("Ray");
});

test("re-links by email instead of duplicating the user", async () => {
  const t = convexTest(schema, modules);
  const first = await t.run(async (ctx) =>
    ctx.db.insert("users", { email: "ray@example.com", name: "Old name" }),
  );
  const relinked = await t.run(async (ctx) =>
    upsertAllowlistedUser(ctx, {
      existingUserId: null,
      profile: { email: "ray@example.com", name: "New name", image: null },
    }),
  );
  expect(relinked).toBe(first);
  const users = await t.run(async (ctx) => ctx.db.query("users").collect());
  expect(users).toHaveLength(1);
  expect(users[0].name).toBe("New name");
});

test("patches the existing user when existingUserId is provided", async () => {
  const t = convexTest(schema, modules);
  const existing = await t.run(async (ctx) =>
    ctx.db.insert("users", { email: "ray@example.com" }),
  );
  const result = await t.run(async (ctx) =>
    upsertAllowlistedUser(ctx, {
      existingUserId: existing,
      profile: { email: "ray@example.com", name: "Ray", image: "https://img" },
    }),
  );
  expect(result).toBe(existing);
  const user = await t.run(async (ctx) => ctx.db.get(existing));
  expect(user?.image).toBe("https://img");
});

test("viewer returns null when unauthenticated", async () => {
  const t = convexTest(schema, modules);
  expect(await t.query(api.users.viewer, {})).toBeNull();
});

test("viewer returns the signed-in user's email and name", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run(async (ctx) =>
    ctx.db.insert("users", { email: "ray@example.com", name: "Ray" }),
  );
  const asUser = t.withIdentity({ subject: `${userId}|session1` });
  expect(await asUser.query(api.users.viewer, {})).toEqual({
    email: "ray@example.com",
    name: "Ray",
  });
});
