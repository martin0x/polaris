import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/systems/journal/services/computeActiveTopics", () => ({
  computeActiveTopics: vi.fn().mockResolvedValue(undefined),
}));

import { GET } from "./route";
import { computeActiveTopics } from "@/systems/journal/services/computeActiveTopics";

describe("GET /api/cron/compute-active-topics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
  });

  it("returns 401 when authorization header is missing", async () => {
    const req = new NextRequest(
      "http://localhost/api/cron/compute-active-topics"
    );
    const res = await GET(req);
    expect(res.status).toBe(401);
    expect(computeActiveTopics).not.toHaveBeenCalled();
  });

  it("returns 401 when secret is wrong", async () => {
    const req = new NextRequest(
      "http://localhost/api/cron/compute-active-topics",
      { headers: { authorization: "Bearer wrong" } }
    );
    const res = await GET(req);
    expect(res.status).toBe(401);
    expect(computeActiveTopics).not.toHaveBeenCalled();
  });

  it("returns 401 when CRON_SECRET env var is unset", async () => {
    delete process.env.CRON_SECRET;
    const req = new NextRequest(
      "http://localhost/api/cron/compute-active-topics",
      { headers: { authorization: "Bearer anything" } }
    );
    const res = await GET(req);
    expect(res.status).toBe(401);
    expect(computeActiveTopics).not.toHaveBeenCalled();
  });

  it("runs computeActiveTopics and returns 200 with valid secret", async () => {
    const req = new NextRequest(
      "http://localhost/api/cron/compute-active-topics",
      { headers: { authorization: "Bearer test-secret" } }
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(computeActiveTopics).toHaveBeenCalledOnce();
    expect(await res.json()).toEqual({ ok: true });
  });
});
