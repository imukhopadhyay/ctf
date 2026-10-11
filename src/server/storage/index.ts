import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { chmod, mkdir, readdir, rename, stat, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { env } from "../env";

/**
 * Artifact storage adapter. Objects are content-addressed by SHA-256 and
 * written read-only, so original evidence cannot be modified in place.
 * Production deployments may swap in an object-store implementation of the
 * same interface (see docs/DEPLOYMENT.md).
 */
export interface ArtifactStore {
  put(data: Buffer): Promise<{ key: string; sha256: string; size: number }>;
  stream(key: string): Promise<ReadableStream<Uint8Array>>;
  read(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  usageBytes(): Promise<{ bytes: number; objects: number }>;
}

const KEY_RE = /^[a-f0-9]{64}$/;

class LocalFsStore implements ArtifactStore {
  constructor(private readonly root: string) {}

  private pathFor(key: string) {
    if (!KEY_RE.test(key)) throw new Error("Invalid storage key");
    return path.join(this.root, key.slice(0, 2), key.slice(2, 4), key);
  }

  async put(data: Buffer) {
    const sha256 = createHash("sha256").update(data).digest("hex");
    const target = this.pathFor(sha256);
    if (!(await this.exists(sha256))) {
      await mkdir(path.dirname(target), { recursive: true });
      const tmp = `${target}.${randomBytes(6).toString("hex")}.tmp`;
      await writeFile(tmp, data, { mode: 0o600 });
      await chmod(tmp, 0o444);
      await rename(tmp, target).catch(async (e) => {
        await unlink(tmp).catch(() => undefined);
        throw e;
      });
    }
    return { key: sha256, sha256, size: data.length };
  }

  async stream(key: string) {
    const nodeStream = createReadStream(this.pathFor(key));
    return Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
  }

  async read(key: string) {
    const { readFile } = await import("node:fs/promises");
    return readFile(this.pathFor(key));
  }

  async exists(key: string) {
    try {
      await stat(this.pathFor(key));
      return true;
    } catch {
      return false;
    }
  }

  async usageBytes() {
    let bytes = 0;
    let objects = 0;
    const walk = async (dir: string, depth: number): Promise<void> => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory() && depth < 2) await walk(p, depth + 1);
        else if (e.isFile() && KEY_RE.test(e.name)) {
          bytes += (await stat(p)).size;
          objects++;
        }
      }
    };
    await walk(this.root, 0);
    return { bytes, objects };
  }
}

let store: ArtifactStore | undefined;
export function artifactStore(): ArtifactStore {
  store ??= new LocalFsStore(path.resolve(env().STORAGE_DIR));
  return store;
}
