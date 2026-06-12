/** Optimistic sync queue for the capture page. Framework-free so it unit-tests
 *  without a DOM. Ops drain serially; failures back off 1s → 30s; the pending
 *  list is mirrored to storage so a refresh inside a dead zone replays it. */

export interface QueueOp {
  kind: "put" | "delete";
  itemId: string;
  body?: { name: string; amountCentavos: number; position: number };
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface SyncQueueOptions {
  activityId: string;
  fetchFn?: typeof fetch;
  storage?: StorageLike;
  /** (pendingCount, failing) — fired on every queue state change. */
  onChange?: (pending: number, failing: boolean) => void;
}

const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;

export class SyncQueue {
  private ops: QueueOp[] = [];
  private draining = false;
  private failing = false;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly fetchFn: typeof fetch;
  private readonly storage: StorageLike | null;
  private readonly key: string;

  constructor(private readonly opts: SyncQueueOptions) {
    this.fetchFn = opts.fetchFn ?? fetch.bind(globalThis);
    this.storage = opts.storage ?? (typeof window !== "undefined" ? window.localStorage : null);
    this.key = `expenses:queue:${opts.activityId}`;
    this.restore();
  }

  enqueue(op: QueueOp): void {
    // Coalesce: the latest op for an item supersedes any earlier one.
    this.ops = this.ops.filter((o) => o.itemId !== op.itemId);
    this.ops.push(op);
    this.persist();
    this.notify();
    void this.drain();
  }

  /** Pending ops not yet confirmed by the server (for merge-on-mount). */
  pendingOps(): QueueOp[] {
    return [...this.ops];
  }

  pending(): number {
    return this.ops.length;
  }

  /** Reset backoff and try again now (online / visibilitychange events). */
  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.attempt = 0;
    void this.drain();
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  private url(op: QueueOp): string {
    return `/api/systems/expenses/activities/${this.opts.activityId}/items/${op.itemId}`;
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    while (this.ops.length > 0) {
      const op = this.ops[0];
      let res: Response;
      try {
        res = await this.fetchFn(
          this.url(op),
          op.kind === "put"
            ? {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(op.body),
              }
            : { method: "DELETE" }
        );
      } catch {
        this.scheduleRetry();
        return;
      }
      if (res.redirected) {
        // An auth redirect (expired session) means the op never reached the
        // API — retry until the session is restored, never drop.
        this.scheduleRetry();
        return;
      }
      if (res.ok) {
        this.ops.shift();
        this.attempt = 0;
        this.failing = false;
        this.persist();
        this.notify();
      } else if (res.status === 400 || res.status === 404 || res.status === 409) {
        // Only statuses the API emits as permanent verdicts are dropped —
        // anything else (401/403/405/5xx) might succeed after re-auth or recovery.
        console.error(`expenses sync: dropping ${op.kind} ${op.itemId} (${res.status})`);
        this.ops.shift();
        this.persist();
        this.notify();
      } else {
        this.scheduleRetry();
        return;
      }
    }
    this.draining = false;
  }

  private scheduleRetry(): void {
    this.failing = true;
    this.notify();
    const delay = Math.min(BASE_DELAY_MS * 2 ** this.attempt, MAX_DELAY_MS);
    this.attempt += 1;
    this.draining = false;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.drain();
    }, delay);
  }

  private persist(): void {
    if (!this.storage) return;
    if (this.ops.length === 0) this.storage.removeItem(this.key);
    else this.storage.setItem(this.key, JSON.stringify(this.ops));
  }

  private restore(): void {
    if (!this.storage) return;
    const raw = this.storage.getItem(this.key);
    if (!raw) {
      // Another queue instance may have already flushed and cleared storage.
      this.ops = [];
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) this.ops = parsed;
    } catch {
      this.storage.removeItem(this.key);
      this.ops = [];
    }
  }

  private notify(): void {
    this.opts.onChange?.(this.ops.length, this.failing);
  }
}
