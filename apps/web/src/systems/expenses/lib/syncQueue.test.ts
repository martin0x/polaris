import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyncQueue, type QueueOp } from "./syncQueue";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    _map: map,
  };
}

function putOp(itemId: string): QueueOp {
  return {
    kind: "put",
    itemId,
    body: { name: "Eggs", amountCentavos: 100, position: 0 },
  };
}

const ok = () => Promise.resolve(new Response(null, { status: 200 }));
const serverError = () => Promise.resolve(new Response(null, { status: 500 }));

describe("SyncQueue", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("drains an enqueued put with a PUT to the item url", async () => {
    const fetchFn = vi.fn(ok);
    const q = new SyncQueue({ activityId: "a1", fetchFn, storage: memoryStorage() });
    q.enqueue(putOp("i1"));
    await vi.runAllTimersAsync();
    expect(fetchFn).toHaveBeenCalledWith(
      "/api/systems/expenses/activities/a1/items/i1",
      expect.objectContaining({ method: "PUT" })
    );
    expect(q.pending()).toBe(0);
  });

  it("retries with backoff on 500 and reports failing", async () => {
    const fetchFn = vi.fn(serverError);
    const onChange = vi.fn();
    const q = new SyncQueue({ activityId: "a1", fetchFn, storage: memoryStorage(), onChange });
    q.enqueue(putOp("i1"));
    await vi.advanceTimersByTimeAsync(0);
    expect(q.pending()).toBe(1);
    expect(onChange).toHaveBeenLastCalledWith(1, true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    fetchFn.mockImplementation(ok);
    await vi.advanceTimersByTimeAsync(2000);
    expect(q.pending()).toBe(0);
    expect(onChange).toHaveBeenLastCalledWith(0, false);
  });

  it("drops the op on a 4xx instead of retrying forever", async () => {
    const fetchFn = vi.fn(() => Promise.resolve(new Response(null, { status: 409 })));
    const q = new SyncQueue({ activityId: "a1", fetchFn, storage: memoryStorage() });
    q.enqueue(putOp("i1"));
    await vi.runAllTimersAsync();
    expect(q.pending()).toBe(0);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("retries on 401 instead of dropping", async () => {
    const fetchFn = vi.fn(() => Promise.resolve(new Response(null, { status: 401 })));
    const q = new SyncQueue({ activityId: "a1", fetchFn, storage: memoryStorage() });
    q.enqueue(putOp("i1"));
    await vi.advanceTimersByTimeAsync(0);
    expect(q.pending()).toBe(1);
    fetchFn.mockImplementation(ok);
    await vi.advanceTimersByTimeAsync(1000);
    expect(q.pending()).toBe(0);
  });

  it("retries on an auth redirect instead of trusting the response", async () => {
    const redirected = Object.defineProperty(new Response(null, { status: 200 }), "redirected", { value: true });
    const fetchFn = vi.fn(() => Promise.resolve(redirected));
    const q = new SyncQueue({ activityId: "a1", fetchFn, storage: memoryStorage() });
    q.enqueue(putOp("i1"));
    await vi.advanceTimersByTimeAsync(0);
    expect(q.pending()).toBe(1);
    q.dispose();
  });

  it("coalesces a second put for the same item", async () => {
    const fetchFn = vi.fn(serverError);
    const q = new SyncQueue({ activityId: "a1", fetchFn, storage: memoryStorage() });
    q.enqueue(putOp("i1"));
    await vi.advanceTimersByTimeAsync(0);
    q.enqueue({ ...putOp("i1"), body: { name: "Eggs", amountCentavos: 999, position: 0 } });
    expect(q.pending()).toBe(1);
  });

  it("persists pending ops and restores them", async () => {
    const storage = memoryStorage();
    const fetchFn = vi.fn(serverError);
    const q = new SyncQueue({ activityId: "a1", fetchFn, storage });
    q.enqueue(putOp("i1"));
    await vi.advanceTimersByTimeAsync(0);
    // Simulate a refresh: the old instance's retry timer dies with the page.
    q.dispose();
    const fetchFn2 = vi.fn(ok);
    const q2 = new SyncQueue({ activityId: "a1", fetchFn: fetchFn2, storage });
    expect(q2.pending()).toBe(1);
    q2.flush();
    await vi.runAllTimersAsync();
    expect(q2.pending()).toBe(0);
  });

  it("sends a DELETE for delete ops", async () => {
    const fetchFn = vi.fn(ok);
    const q = new SyncQueue({ activityId: "a1", fetchFn, storage: memoryStorage() });
    q.enqueue({ kind: "delete", itemId: "i1" });
    await vi.runAllTimersAsync();
    expect(fetchFn).toHaveBeenCalledWith(
      "/api/systems/expenses/activities/a1/items/i1",
      expect.objectContaining({ method: "DELETE" })
    );
  });
});
