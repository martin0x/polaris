import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { requireTestDatabase, withCleanHabitTables } from "@/test/db";
import { addDays, todayString } from "../lib/dates";
import { createHabit as createHabitRoute, updateHabit, reorderRoute, archiveRoute, unarchiveRoute, recreateTopicRoute } from "./habits";
import { getWeekRoute, putTick, deleteTick } from "./ticks";
import { getDetailRoute } from "./detail";

function req(method: string, body?: unknown, url = "http://localhost/api/systems/habits/x") {
  return new NextRequest(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("habits routes", () => {
  beforeAll(() => requireTestDatabase());
  beforeEach(() => withCleanHabitTables());

  async function makeHabit(name = "Run") {
    const res = await createHabitRoute(req("POST", { name }), {});
    expect(res.status).toBe(201);
    return (await res.json()).habit as { id: string; name: string };
  }

  it("POST /habits creates; duplicate name 409s", async () => {
    await makeHabit("Run");
    const dup = await createHabitRoute(req("POST", { name: "Run" }), {});
    expect(dup.status).toBe(409);
  });

  it("GET /week returns the tracker payload", async () => {
    const habit = await makeHabit();
    const today = todayString();
    await putTick(req("PUT", { status: "PARTIAL" }), { id: habit.id, date: today });
    const res = await getWeekRoute(
      req("GET", undefined, `http://localhost/api/systems/habits/week?start=${today}`), {}
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.habits).toHaveLength(1);
    expect(json.ticks).toHaveLength(1);
  });

  it("GET /week without a valid start 400s", async () => {
    const res = await getWeekRoute(
      req("GET", undefined, "http://localhost/api/systems/habits/week?start=nope"), {}
    );
    expect(res.status).toBe(400);
  });

  it("GET /week with a calendar-invalid start 400s", async () => {
    const res = await getWeekRoute(
      req("GET", undefined, "http://localhost/api/systems/habits/week?start=2026-13-01"), {}
    );
    expect(res.status).toBe(400);
  });

  it("PUT tick with a calendar-invalid date 400s", async () => {
    const habit = await makeHabit();
    const res = await putTick(
      req("PUT", { status: "PARTIAL" }), { id: habit.id, date: "2026-02-30" }
    );
    expect(res.status).toBe(400);
  });

  it("PUT tick rejects future dates with 400", async () => {
    const habit = await makeHabit();
    const res = await putTick(
      req("PUT", { status: "COMPLETE" }), { id: habit.id, date: addDays(todayString(), 1) }
    );
    expect(res.status).toBe(400);
  });

  it("DELETE tick returns 204", async () => {
    const habit = await makeHabit();
    const res = await deleteTick(req("DELETE"), { id: habit.id, date: todayString() });
    expect(res.status).toBe(204);
  });

  it("PATCH /habits/:id renames and 409s on topic collision", async () => {
    const a = await makeHabit("A");
    await makeHabit("B");
    const collide = await updateHabit(req("PATCH", { name: "B" }), { id: a.id });
    expect(collide.status).toBe(409);
    const ok = await updateHabit(req("PATCH", { name: "C", quote: "Daily." }), { id: a.id });
    expect(ok.status).toBe(200);
    expect((await ok.json()).habit.quote).toBe("Daily.");
  });

  it("PATCH /reorder validates the id list", async () => {
    const a = await makeHabit("A");
    const b = await makeHabit("B");
    const ok = await reorderRoute(req("PATCH", { ids: [b.id, a.id] }), {});
    expect(ok.status).toBe(200);
    const bad = await reorderRoute(req("PATCH", { ids: [a.id] }), {});
    expect(bad.status).toBe(400);
  });

  it("archive/unarchive/recreate-topic round-trip", async () => {
    const habit = await makeHabit();
    expect((await archiveRoute(req("POST"), { id: habit.id })).status).toBe(200);
    expect((await unarchiveRoute(req("POST"), { id: habit.id })).status).toBe(200);
    expect((await recreateTopicRoute(req("POST"), { id: habit.id })).status).toBe(200);
    expect((await archiveRoute(req("POST"), { id: "nope" })).status).toBe(404);
  });

  it("GET detail 404s on unknown habit and 200s otherwise", async () => {
    const habit = await makeHabit();
    const today = todayString();
    const ok = await getDetailRoute(
      req("GET", undefined, `http://localhost/x?week=${today}`), { id: habit.id }
    );
    expect(ok.status).toBe(200);
    expect((await ok.json()).topicState).toBe("ok");
    const gone = await getDetailRoute(
      req("GET", undefined, `http://localhost/x?week=${today}`), { id: "nope" }
    );
    expect(gone.status).toBe(404);
  });
});
