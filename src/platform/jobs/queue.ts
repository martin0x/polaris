import { Queue } from "bullmq";
import { getRedisConnection } from "./connection";

const queues = new Map<string, Queue>();

export function getQueue(name: string): Queue {
  const existing = queues.get(name);
  if (existing) return existing;

  const queue = new Queue(name, { connection: getRedisConnection() });
  queues.set(name, queue);
  return queue;
}

export function getAllQueues(): Map<string, Queue> {
  return queues;
}
