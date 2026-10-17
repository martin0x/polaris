import type {
  BridgeEntry,
  BridgeTopic,
  CreateLogResult,
} from "@/systems/habits/services/journalBridge";

// In-memory stand-in for the habits → journal bridge. Integration tests mock
// "@/systems/habits/services/journalBridge" with this module, then arrange
// and assert journal state through `fakeJournal`. Module state is shared, so
// call fakeJournal.reset() in beforeEach.

interface FakeEntry extends BridgeEntry {
  topicId: string;
  deleted: boolean;
}

const topics = new Map<string, BridgeTopic>();
const entries: FakeEntry[] = [];
let seq = 0;

function findByName(name: string): BridgeTopic | undefined {
  for (const t of topics.values()) if (t.name === name) return t;
  return undefined;
}

function addTopic(name: string, archived = false): string {
  const id = `topic-${++seq}`;
  topics.set(id, { id, name, archived });
  return id;
}

export const journalBridge = {
  async ensureTopic(name: string): Promise<string> {
    return findByName(name)?.id ?? addTopic(name);
  },
  async topicState(ref: string): Promise<BridgeTopic | null> {
    const t = topics.get(ref);
    return t ? { ...t } : null;
  },
  async renameTopic(ref: string, name: string): Promise<"ok" | "collision"> {
    const t = topics.get(ref);
    if (!t || t.name === name) return "ok";
    if (findByName(name)) return "collision";
    t.name = name;
    return "ok";
  },
  async setTopicArchived(ref: string, archived: boolean): Promise<void> {
    const t = topics.get(ref);
    if (t) t.archived = archived;
  },
  async createLog(
    ref: string,
    input: { title: string | null; body: string; createdAt?: number }
  ): Promise<CreateLogResult> {
    const t = topics.get(ref);
    if (!t) return { ok: false, reason: "missing" };
    if (t.archived) return { ok: false, reason: "archived" };
    const entry: FakeEntry = {
      id: `entry-${++seq}`,
      topicId: ref,
      title: input.title,
      body: input.body,
      createdAt: input.createdAt ?? Date.now(),
      deleted: false,
    };
    entries.push(entry);
    return { ok: true, entry: { id: entry.id, title: entry.title, body: entry.body, createdAt: entry.createdAt } };
  },
  async topicEntries(ref: string, fromMs: number, toMs: number): Promise<BridgeEntry[]> {
    return entries
      .filter((e) => e.topicId === ref && !e.deleted && e.createdAt >= fromMs && e.createdAt < toMs)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(({ id, title, body, createdAt }) => ({ id, title, body, createdAt }));
  },
};

export const fakeJournal = {
  reset(): void {
    topics.clear();
    entries.length = 0;
    seq = 0;
  },
  addTopic,
  addEntry(
    topicId: string,
    entry: { title?: string | null; body: string; createdAt?: number; deleted?: boolean }
  ): string {
    const id = `entry-${++seq}`;
    entries.push({
      id,
      topicId,
      title: entry.title ?? null,
      body: entry.body,
      createdAt: entry.createdAt ?? Date.now(),
      deleted: entry.deleted ?? false,
    });
    return id;
  },
  topic(id: string): BridgeTopic | undefined {
    return topics.get(id);
  },
  entry(id: string): FakeEntry | undefined {
    return entries.find((e) => e.id === id);
  },
  setArchived(id: string, archived: boolean): void {
    const t = topics.get(id);
    if (t) t.archived = archived;
  },
  removeTopic(id: string): void {
    topics.delete(id);
  },
};
