import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { requireTestDatabase, withCleanExpenseTables } from "@/test/db";
import { createType as createTypeService } from "../services/types";
import { startActivity } from "../services/activities";
import * as typeRoutes from "./types";
import * as activityRoutes from "./activities";
import * as trendRoutes from "./trends";

requireTestDatabase();

beforeEach(withCleanExpenseTables);

function jsonReq(method: string, body?: unknown, url = "http://test/api"): NextRequest {
  return new NextRequest(url, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

describe("type routes", () => {
  it("POST /types creates; duplicate name is 409", async () => {
    const res = await typeRoutes.createType(jsonReq("POST", { name: "Groceries" }), {});
    expect(res.status).toBe(201);
    const dup = await typeRoutes.createType(jsonReq("POST", { name: "Groceries" }), {});
    expect(dup.status).toBe(409);
  });

  it("POST /types rejects an empty name", async () => {
    const res = await typeRoutes.createType(jsonReq("POST", { name: " " }), {});
    expect(res.status).toBe(400);
  });

  it("PATCH /types/:id archives; unknown id is 404", async () => {
    const t = await createTypeService("Errands");
    const res = await typeRoutes.updateType(jsonReq("PATCH", { archived: true }), { id: t.id });
    expect(res.status).toBe(200);
    const missing = await typeRoutes.updateType(jsonReq("PATCH", { archived: true }), {
      id: "nope",
    });
    expect(missing.status).toBe(404);
  });
});

describe("activity routes", () => {
  it("POST /activities starts one; unknown typeId is 400", async () => {
    const t = await createTypeService("Groceries");
    const res = await activityRoutes.createActivity(jsonReq("POST", { typeId: t.id }), {});
    expect(res.status).toBe(201);
    const bad = await activityRoutes.createActivity(jsonReq("POST", { typeId: "nope" }), {});
    expect(bad.status).toBe(400);
  });

  it("GET /activities/:id returns items; unknown id is 404", async () => {
    const t = await createTypeService("Groceries");
    const a = await startActivity({ typeId: t.id });
    const res = await activityRoutes.getActivity(jsonReq("GET"), { id: a.id });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.activity.items).toEqual([]);
    const missing = await activityRoutes.getActivity(jsonReq("GET"), { id: "nope" });
    expect(missing.status).toBe(404);
  });

  it("PUT item is idempotent over HTTP; cross-activity id is 409", async () => {
    const t = await createTypeService("Groceries");
    const a = await startActivity({ typeId: t.id });
    const b = await startActivity({ typeId: t.id });
    const body = { name: "Eggs", amountCentavos: 21500, position: 0 };
    const r1 = await activityRoutes.putItem(jsonReq("PUT", body), { id: a.id, itemId: "c1" });
    expect(r1.status).toBe(200);
    const r2 = await activityRoutes.putItem(jsonReq("PUT", body), { id: a.id, itemId: "c1" });
    expect(r2.status).toBe(200);
    const conflict = await activityRoutes.putItem(jsonReq("PUT", body), {
      id: b.id,
      itemId: "c1",
    });
    expect(conflict.status).toBe(409);
  });

  it("PUT item on a missing activity is 404", async () => {
    const body = { name: "Eggs", amountCentavos: 21500, position: 0 };
    const res = await activityRoutes.putItem(jsonReq("PUT", body), { id: "nope", itemId: "c1" });
    expect(res.status).toBe(404);
  });

  it("DELETE item succeeds even when already gone", async () => {
    const t = await createTypeService("Groceries");
    const a = await startActivity({ typeId: t.id });
    const res = await activityRoutes.deleteItem(jsonReq("DELETE"), {
      id: a.id,
      itemId: "never-existed",
    });
    expect(res.status).toBe(204);
  });

  it("DELETE /activities/:id removes it", async () => {
    const t = await createTypeService("Groceries");
    const a = await startActivity({ typeId: t.id });
    const res = await activityRoutes.deleteActivity(jsonReq("DELETE"), { id: a.id });
    expect(res.status).toBe(204);
    const gone = await activityRoutes.getActivity(jsonReq("GET"), { id: a.id });
    expect(gone.status).toBe(404);
  });
});

describe("trends route", () => {
  it("GET /trends returns buckets and stats; bad months is 400", async () => {
    const res = await trendRoutes.getTrends(
      new NextRequest("http://test/api?months=3", { method: "GET" }),
      {}
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.months).toHaveLength(3);
    const bad = await trendRoutes.getTrends(
      new NextRequest("http://test/api?months=7", { method: "GET" }),
      {}
    );
    expect(bad.status).toBe(400);
  });
});
