import { readFile, writeFile, rename, mkdir, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
/** Local-only adapter uses the same object keys and atomic per-object replacement as the cloud. */
export function localStore(root) {
  async function walk(dir, limit) {
    let entries;
    try {
      entries = await readdir(join(root, dir), { withFileTypes: true });
    } catch (e) {
      if (e.code === "ENOENT") return [];
      throw e;
    }
    const keys = [];
    for (const entry of entries) {
      if (keys.length >= limit) break;
      const key = join(dir, entry.name);
      if (entry.isDirectory())
        keys.push(...(await walk(key, limit - keys.length)));
      else if (entry.name.endsWith(".json")) keys.push(key.slice(0, -5));
    }
    return keys;
  }
  return {
    async get(key) {
      try {
        return JSON.parse(await readFile(join(root, key + ".json"), "utf8"));
      } catch (e) {
        if (e.code === "ENOENT") return null;
        throw e;
      }
    },
    async put(key, value) {
      const path = join(root, key + ".json"),
        tmp = path + "." + randomUUID();
      await mkdir(dirname(path), { recursive: true });
      await writeFile(tmp, JSON.stringify(value));
      await rename(tmp, path);
    },
    keys: walk,
  };
}
