import IORedis from "ioredis";

let connectionInstance: IORedis | null = null;

export function getRedisConnection(): IORedis {
  if (connectionInstance) return connectionInstance;

  const url = process.env.REDIS_URL || "redis://localhost:6379";
  connectionInstance = new IORedis(url, { maxRetriesPerRequest: null });

  return connectionInstance;
}
