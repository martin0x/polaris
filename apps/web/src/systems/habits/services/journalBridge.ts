import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "@polaris/backend/convex/_generated/api";

// Strangler-window bridge (phase 3 → 4): habits lives in Postgres, the journal
// in Convex. Every habits → journal call goes through this one module, so the
// integration tests can swap in src/test/fakeJournal.ts and phase 4 can delete
// it whole. `ref` is a habit's stored journalTopicId.

export interface BridgeTopic {
  id: string;
  name: string;
  archived: boolean;
}

export interface BridgeEntry {
  id: string;
  title: string | null;
  body: string;
  createdAt: number; // ms
}

export type CreateLogResult =
  | { ok: true; entry: BridgeEntry }
  | { ok: false; reason: "missing" | "archived" };

async function auth() {
  return { token: await convexAuthNextjsToken() };
}

export const journalBridge = {
  async ensureTopic(name: string): Promise<string> {
    return fetchMutation(api.journal.habitBridge.ensureTopic, { name }, await auth());
  },

  async topicState(ref: string): Promise<BridgeTopic | null> {
    return fetchQuery(api.journal.habitBridge.topicState, { ref }, await auth());
  },

  async renameTopic(ref: string, name: string): Promise<"ok" | "collision"> {
    const result = await fetchMutation(api.journal.habitBridge.renameTopic, { ref, name }, await auth());
    return result.ok ? "ok" : "collision";
  },

  async setTopicArchived(ref: string, archived: boolean): Promise<void> {
    await fetchMutation(api.journal.habitBridge.setTopicArchived, { ref, archived }, await auth());
  },

  async createLog(
    ref: string,
    input: { title: string | null; body: string; createdAt?: number }
  ): Promise<CreateLogResult> {
    return fetchMutation(
      api.journal.habitBridge.createLog,
      {
        ref,
        title: input.title,
        body: input.body,
        ...(input.createdAt === undefined ? {} : { createdAt: input.createdAt }),
      },
      await auth()
    );
  },

  async topicEntries(ref: string, fromMs: number, toMs: number): Promise<BridgeEntry[]> {
    return fetchQuery(api.journal.habitBridge.topicEntries, { ref, fromMs, toMs }, await auth());
  },
};
