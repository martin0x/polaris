import fs from "fs/promises";
import path from "path";
import { StorageDriver, StorageMetadata } from "./types";

export function createLocalStorage(basePath: string): StorageDriver {
  return {
    async upload(key: string, data: Buffer, _metadata: StorageMetadata) {
      const filePath = path.join(basePath, key);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, data);
    },

    async download(key: string) {
      const filePath = path.join(basePath, key);
      return fs.readFile(filePath);
    },

    async delete(key: string) {
      const filePath = path.join(basePath, key);
      await fs.unlink(filePath);
    },

    async getUrl(key: string) {
      return `/api/platform/storage/${key}`;
    },
  };
}
