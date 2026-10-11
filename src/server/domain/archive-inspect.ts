/**
 * Defensive ZIP inspection without extraction. Parses only the central
 * directory and rejects archives that could be used for path traversal,
 * symlink attacks or decompression bombs. No decompression is performed.
 */

export interface ArchiveLimits {
  maxEntries: number;
  maxTotalUncompressed: number;
  maxEntryUncompressed: number;
  maxCompressionRatio: number;
  maxNestingDepth: number;
}

export const DEFAULT_ARCHIVE_LIMITS: ArchiveLimits = {
  maxEntries: 2_000,
  maxTotalUncompressed: 1024 * 1024 * 1024, // 1 GiB
  maxEntryUncompressed: 512 * 1024 * 1024,
  maxCompressionRatio: 200,
  maxNestingDepth: 16,
};

export interface ArchiveEntry {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  isDirectory: boolean;
  encrypted: boolean;
}

export interface ArchiveReport {
  ok: boolean;
  entries: ArchiveEntry[];
  totalUncompressed: number;
  problems: string[];
}

export function isUnsafeArchivePath(name: string): string | null {
  if (name.length === 0) return "empty entry name";
  if (name.includes("\0")) return "NUL byte in entry name";
  if (name.includes("\\")) return "backslash in entry name";
  if (name.startsWith("/")) return "absolute path";
  if (/^[a-zA-Z]:/.test(name)) return "drive-letter path";
  const parts = name.split("/");
  if (parts.some((p) => p === "..")) return "parent-directory traversal";
  return null;
}

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;

export function inspectZip(buf: Buffer, limits: ArchiveLimits = DEFAULT_ARCHIVE_LIMITS): ArchiveReport {
  const problems: string[] = [];
  const entries: ArchiveEntry[] = [];
  const fail = (msg: string): ArchiveReport => ({ ok: false, entries, totalUncompressed: 0, problems: [...problems, msg] });

  // Locate End Of Central Directory (last 22 + max 65535 comment bytes).
  const minEocd = 22;
  if (buf.length < minEocd) return fail("file too small to be a ZIP archive");
  let eocd = -1;
  const searchStart = Math.max(0, buf.length - (minEocd + 0xffff));
  for (let i = buf.length - minEocd; i >= searchStart; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return fail("end of central directory not found");

  const totalEntries = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (totalEntries === 0xffff || cdOffset === 0xffffffff) return fail("ZIP64 archives are not accepted");
  if (totalEntries > limits.maxEntries) return fail(`too many entries (${totalEntries} > ${limits.maxEntries})`);
  if (cdOffset + cdSize > buf.length) return fail("central directory out of bounds");

  let p = cdOffset;
  let total = 0;
  const seen = new Set<string>();
  for (let i = 0; i < totalEntries; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CEN_SIG) return fail("corrupt central directory");
    const versionMadeBy = buf.readUInt16LE(p + 4);
    const flags = buf.readUInt16LE(p + 8);
    const compressedSize = buf.readUInt32LE(p + 20);
    const uncompressedSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const externalAttrs = buf.readUInt32LE(p + 38);
    if (p + 46 + nameLen > buf.length) return fail("entry name out of bounds");
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString((flags & 0x800) !== 0 ? "utf8" : "latin1");
    p += 46 + nameLen + extraLen + commentLen;

    const unsafe = isUnsafeArchivePath(name);
    if (unsafe) problems.push(`${JSON.stringify(name)}: ${unsafe}`);
    const hostOs = versionMadeBy >> 8;
    const unixMode = externalAttrs >>> 16;
    if (hostOs === 3 && (unixMode & 0o170000) === 0o120000) problems.push(`${JSON.stringify(name)}: symbolic link`);
    if (name.split("/").length > limits.maxNestingDepth) problems.push(`${JSON.stringify(name)}: nesting too deep`);
    if (seen.has(name)) problems.push(`${JSON.stringify(name)}: duplicate entry`);
    seen.add(name);
    if (uncompressedSize > limits.maxEntryUncompressed) problems.push(`${JSON.stringify(name)}: entry too large`);
    if (compressedSize > 0 && uncompressedSize / compressedSize > limits.maxCompressionRatio && uncompressedSize > 1024 * 1024)
      problems.push(`${JSON.stringify(name)}: suspicious compression ratio (possible decompression bomb)`);
    if (compressedSize === 0 && uncompressedSize > 0) problems.push(`${JSON.stringify(name)}: inconsistent sizes`);
    total += uncompressedSize;
    entries.push({
      name,
      compressedSize,
      uncompressedSize,
      isDirectory: name.endsWith("/"),
      encrypted: (flags & 0x1) !== 0,
    });
  }
  if (total > limits.maxTotalUncompressed) problems.push(`total uncompressed size ${total} exceeds limit`);
  return { ok: problems.length === 0, entries, totalUncompressed: total, problems };
}
