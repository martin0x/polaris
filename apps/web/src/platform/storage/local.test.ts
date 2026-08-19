import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createLocalStorage } from "./local";
import fs from "fs/promises";
import path from "path";
import os from "os";

let tmpDir: string;
let storage: ReturnType<typeof createLocalStorage>;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "polaris-test-"));
  storage = createLocalStorage(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("LocalStorage", () => {
  it("uploads and downloads a file", async () => {
    const data = Buffer.from("hello world");
    await storage.upload("test/file.txt", data, { contentType: "text/plain" });

    const result = await storage.download("test/file.txt");
    expect(result.toString()).toBe("hello world");
  });

  it("deletes a file", async () => {
    const data = Buffer.from("to delete");
    await storage.upload("test/delete-me.txt", data, {});
    await storage.delete("test/delete-me.txt");

    await expect(storage.download("test/delete-me.txt")).rejects.toThrow();
  });

  it("returns a file path as URL for local driver", async () => {
    const data = Buffer.from("url test");
    await storage.upload("test/url.txt", data, {});

    const url = await storage.getUrl("test/url.txt");
    expect(url).toContain("test/url.txt");
  });

  it("creates nested directories automatically", async () => {
    const data = Buffer.from("nested");
    await storage.upload("a/b/c/deep.txt", data, {});

    const result = await storage.download("a/b/c/deep.txt");
    expect(result.toString()).toBe("nested");
  });
});
