import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { api } from "@polaris/backend/convex/_generated/api";
import { feedback } from "./index";

vi.mock("convex/nextjs", () => ({
  fetchMutation: vi.fn(),
  fetchQuery: vi.fn(),
}));
vi.mock("@convex-dev/auth/nextjs/server", () => ({
  convexAuthNextjsToken: vi.fn(),
}));

const mockedFetchMutation = vi.mocked(fetchMutation);
const mockedFetchQuery = vi.mocked(fetchQuery);
const mockedToken = vi.mocked(convexAuthNextjsToken);

describe("feedback adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", "k");
  });

  it("records a metric with the service key", async () => {
    await feedback.recordMetric("journal", "entry_created", 1);
    expect(mockedFetchMutation).toHaveBeenCalledWith(api.feedback.recordMetric, {
      system: "journal",
      name: "entry_created",
      value: 1,
      serviceKey: "k",
    });
  });

  it("maps getAllFeedback docs to the legacy shape", async () => {
    mockedToken.mockResolvedValue("tok");
    mockedFetchQuery.mockResolvedValue({
      metrics: [{ _id: "m1", _creationTime: 1, system: "journal", name: "entry_created", value: 2, recordedAt: 1_700_000_000_000 }],
      reflections: [{ _id: "r1", _creationTime: 1, system: "journal", content: "c", strengths: [], weaknesses: [], ideas: [], createdAt: 1_700_000_000_000 }],
      iterations: [{ _id: "i1", _creationTime: 1, system: "expenses", description: "d", reason: "r", createdAt: 1_700_000_000_000 }],
    } as never);
    const result = await feedback.getAllFeedback();
    expect(mockedFetchQuery).toHaveBeenCalledWith(api.feedback.getAllFeedback, {}, { token: "tok" });
    expect(result.metrics[0]).toEqual({
      id: "m1", system: "journal", name: "entry_created", value: 2,
      recordedAt: new Date(1_700_000_000_000),
    });
    expect(result.iterations[0].outcome).toBeNull();
  });
});
