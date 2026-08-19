import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

// Tests live outside convex/ so the CLI never bundles them; that means
// convex-test needs the module map passed explicitly.
const modules = import.meta.glob("../convex/**/*.*s");

test("ping returns pong", async () => {
  const t = convexTest(schema, modules);
  expect(await t.query(api.ping.ping, {})).toBe("pong");
});
