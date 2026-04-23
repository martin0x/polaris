import { StorageDriver } from "./types";
import { createLocalStorage } from "./local";
import { createS3Storage } from "./s3";

let storageInstance: StorageDriver | null = null;

export function getStorage(): StorageDriver {
  if (storageInstance) return storageInstance;

  const driver = process.env.STORAGE_DRIVER || "local";

  if (driver === "s3") {
    storageInstance = createS3Storage({
      bucket: process.env.S3_BUCKET!,
      region: process.env.S3_REGION!,
      endpoint: process.env.S3_ENDPOINT,
      accessKeyId: process.env.S3_ACCESS_KEY!,
      secretAccessKey: process.env.S3_SECRET_KEY!,
    });
  } else {
    const basePath = process.env.STORAGE_LOCAL_PATH || "./uploads";
    storageInstance = createLocalStorage(basePath);
  }

  return storageInstance;
}

export type { StorageDriver, StorageMetadata } from "./types";
