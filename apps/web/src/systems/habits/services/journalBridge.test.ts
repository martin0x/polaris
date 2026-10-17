import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "@polaris/backend/convex/_generated/api";

vi.mock("convex/nextjs", () => ({ fetchMutation: vi.fn(), fetchQuery: vi.fn() }));
vi.mock("@convex-dev/auth/nextjs/server", () => ({
  convexAuthNextjsToken: vi.fn(async () => "tok"),
}));

import { journalBridge } from "./journalBridge";

const mockedMutation = vi.mocked(fetchMutation);
const mockedQuery = vi.mocked(fetchQuery);

describe("habits → journal bridge", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls with the user's token and maps rename results", async () => {
    mockedMutation.mockResolvedValueOnce({ ok: false, reason: "collision" } as never);
    expect(await journalBridge.renameTopic("t1", "Run")).toBe("collision");
    expect(mockedMutation).toHaveBeenCalledWith(
      api.journal.habitBridge.renameTopic,
      { ref: "t1", name: "Run" },
      { token: "tok" }
    );
    mockedMutation.mockResolvedValueOnce({ ok: true } as never);
    expect(await journalBridge.renameTopic("t1", "Run")).toBe("ok");
  });

  it("omits createdAt for today's logs and forwards it for backdated ones", async () => {
    mockedMutation.mockResolvedValue({
      ok: true, entry: { id: "e1", title: null, body: "b", createdAt: 5 },
    } as never);
    await journalBridge.createLog("t1", { title: null, body: "b" });
    expect(mockedMutation).toHaveBeenLastCalledWith(
      api.journal.habitBridge.createLog,
      { ref: "t1", title: null, body: "b" },
      { token: "tok" }
    );
    await journalBridge.createLog("t1", { title: "T", body: "b", createdAt: 42 });
    expect(mockedMutation).toHaveBeenLastCalledWith(
      api.journal.habitBridge.createLog,
      { ref: "t1", title: "T", body: "b", createdAt: 42 },
      { token: "tok" }
    );
  });

  it("reads topic state and a topic's entries in a range", async () => {
    mockedQuery.mockResolvedValueOnce(null as never);
    expect(await journalBridge.topicState("gone")).toBeNull();
    mockedQuery.mockResolvedValueOnce([] as never);
    await journalBridge.topicEntries("t1", 10, 20);
    expect(mockedQuery).toHaveBeenLastCalledWith(
      api.journal.habitBridge.topicEntries,
      { ref: "t1", fromMs: 10, toMs: 20 },
      { token: "tok" }
    );
  });
});
