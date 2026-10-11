/**
 * Magic-byte file identification and bounded metadata extraction.
 * Only headers are parsed; files are never executed or rendered.
 */
import { inspectZip, type ArchiveReport } from "./archive-inspect";

export type DetectedType =
  | "elf"
  | "pe"
  | "mach-o"
  | "png"
  | "jpeg"
  | "gif"
  | "pdf"
  | "zip"
  | "gzip"
  | "tar"
  | "pcap"
  | "pcapng"
  | "wav"
  | "mp3"
  | "sqlite"
  | "text"
  | "unknown";

export interface FileInspection {
  detectedType: DetectedType;
  /** MIME type used for downloads. Always served as an attachment. */
  mimeType: string;
  metadata: Record<string, unknown>;
  /** Hard problems that should block upload (e.g. unsafe archive). */
  blockingProblems: string[];
}

const MIME: Record<DetectedType, string> = {
  elf: "application/x-executable",
  pe: "application/vnd.microsoft.portable-executable",
  "mach-o": "application/x-mach-binary",
  png: "image/png",
  jpeg: "image/jpeg",
  gif: "image/gif",
  pdf: "application/pdf",
  zip: "application/zip",
  gzip: "application/gzip",
  tar: "application/x-tar",
  pcap: "application/vnd.tcpdump.pcap",
  pcapng: "application/vnd.tcpdump.pcap",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  sqlite: "application/vnd.sqlite3",
  text: "text/plain",
  unknown: "application/octet-stream",
};

const startsWith = (b: Buffer, sig: number[], offset = 0) =>
  b.length >= offset + sig.length && sig.every((v, i) => b[offset + i] === v);

export function detectType(b: Buffer): DetectedType {
  if (startsWith(b, [0x7f, 0x45, 0x4c, 0x46])) return "elf";
  if (startsWith(b, [0x4d, 0x5a])) return "pe";
  if ([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe].includes(b.length >= 4 ? b.readUInt32BE(0) : 0)) return "mach-o";
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(b, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(b, [0x47, 0x49, 0x46, 0x38])) return "gif";
  if (startsWith(b, [0x25, 0x50, 0x44, 0x46])) return "pdf";
  if (startsWith(b, [0x50, 0x4b, 0x03, 0x04]) || startsWith(b, [0x50, 0x4b, 0x05, 0x06])) return "zip";
  if (startsWith(b, [0x1f, 0x8b])) return "gzip";
  if (b.length > 262 && b.subarray(257, 262).toString("latin1") === "ustar") return "tar";
  if ([0xa1b2c3d4, 0xd4c3b2a1, 0xa1b23c4d, 0x4d3cb2a1].includes(b.length >= 4 ? b.readUInt32BE(0) : 0)) return "pcap";
  if (startsWith(b, [0x0a, 0x0d, 0x0d, 0x0a])) return "pcapng";
  if (startsWith(b, [0x52, 0x49, 0x46, 0x46]) && b.subarray(8, 12).toString("latin1") === "WAVE") return "wav";
  if (startsWith(b, [0x49, 0x44, 0x33]) || startsWith(b, [0xff, 0xfb])) return "mp3";
  if (b.subarray(0, 16).toString("latin1") === "SQLite format 3\0") return "sqlite";
  if (looksLikeText(b)) return "text";
  return "unknown";
}

function looksLikeText(b: Buffer): boolean {
  const sample = b.subarray(0, 4096);
  if (sample.length === 0) return true;
  let printable = 0;
  for (const c of sample) {
    if (c === 0) return false;
    if (c === 9 || c === 10 || c === 13 || (c >= 32 && c < 127) || c >= 128) printable++;
  }
  return printable / sample.length > 0.95;
}

const ELF_MACHINES: Record<number, string> = {
  0x03: "x86",
  0x08: "MIPS",
  0x14: "PowerPC",
  0x28: "ARM",
  0x3e: "x86-64",
  0xb7: "AArch64",
  0xf3: "RISC-V",
};

function elfMetadata(b: Buffer): Record<string, unknown> {
  if (b.length < 52) return { error: "truncated ELF header" };
  const cls = b[4] === 2 ? 64 : 32;
  const le = b[5] === 1;
  const u16 = (o: number) => (le ? b.readUInt16LE(o) : b.readUInt16BE(o));
  const type = u16(16);
  const machine = u16(18);
  const types: Record<number, string> = { 1: "relocatable", 2: "executable", 3: "shared object / PIE", 4: "core" };
  const meta: Record<string, unknown> = {
    format: `ELF${cls}`,
    endianness: le ? "little" : "big",
    elfType: types[type] ?? `type ${type}`,
    architecture: ELF_MACHINES[machine] ?? `machine 0x${machine.toString(16)}`,
  };
  // Imported dynamic symbol names (best effort, bounded): parse section headers for .dynsym/.dynstr.
  try {
    meta.importedSymbols = elfDynamicSymbols(b, cls, le).slice(0, 64);
    meta.stripped = !elfHasSection(b, cls, le, ".symtab");
  } catch {
    // Malformed section tables are reported as unknown rather than failing the upload.
  }
  return meta;
}

function elfSections(b: Buffer, cls: number, le: boolean) {
  const r16 = (o: number) => (le ? b.readUInt16LE(o) : b.readUInt16BE(o));
  const r32 = (o: number) => (le ? b.readUInt32LE(o) : b.readUInt32BE(o));
  const r64 = (o: number) => Number(le ? b.readBigUInt64LE(o) : b.readBigUInt64BE(o));
  const shoff = cls === 64 ? r64(0x28) : r32(0x20);
  const shentsize = r16(cls === 64 ? 0x3a : 0x2e);
  const shnum = r16(cls === 64 ? 0x3c : 0x30);
  const shstrndx = r16(cls === 64 ? 0x3e : 0x32);
  if (shnum > 512 || shoff + shnum * shentsize > b.length) throw new Error("bad section table");
  const secs = [];
  for (let i = 0; i < shnum; i++) {
    const o = shoff + i * shentsize;
    secs.push({
      nameOff: r32(o),
      type: r32(o + 4),
      offset: cls === 64 ? r64(o + 0x18) : r32(o + 0x10),
      size: cls === 64 ? r64(o + 0x20) : r32(o + 0x14),
      link: r32(cls === 64 ? o + 0x28 : o + 0x18),
      entsize: cls === 64 ? r64(o + 0x38) : r32(o + 0x24),
    });
  }
  const shstr = secs[shstrndx];
  const nameOf = (off: number) => {
    if (!shstr) return "";
    const start = shstr.offset + off;
    const end = b.indexOf(0, start);
    return end > start && end - start < 256 ? b.subarray(start, end).toString("latin1") : "";
  };
  return secs.map((s) => ({ ...s, name: nameOf(s.nameOff) }));
}

function elfHasSection(b: Buffer, cls: number, le: boolean, name: string): boolean {
  return elfSections(b, cls, le).some((s) => s.name === name);
}

function elfDynamicSymbols(b: Buffer, cls: number, le: boolean): string[] {
  const secs = elfSections(b, cls, le);
  const dynsym = secs.find((s) => s.type === 11); // SHT_DYNSYM
  if (!dynsym) return [];
  const dynstr = secs[dynsym.link];
  if (!dynstr || dynsym.offset + dynsym.size > b.length) return [];
  const r16 = (o: number) => (le ? b.readUInt16LE(o) : b.readUInt16BE(o));
  const r32 = (o: number) => (le ? b.readUInt32LE(o) : b.readUInt32BE(o));
  const ent = dynsym.entsize || (cls === 64 ? 24 : 16);
  const names = new Set<string>();
  for (let o = dynsym.offset; o + ent <= dynsym.offset + dynsym.size && names.size < 256; o += ent) {
    const nameOff = r32(o);
    const shndx = cls === 64 ? r16(o + 6) : r16(o + 14);
    if (nameOff === 0 || shndx !== 0) continue; // only undefined (imported) symbols
    const start = dynstr.offset + nameOff;
    const end = b.indexOf(0, start);
    if (end > start && end - start < 128) names.add(b.subarray(start, end).toString("latin1"));
  }
  return [...names].sort();
}

function pngMetadata(b: Buffer): Record<string, unknown> {
  if (b.length < 33) return { error: "truncated PNG" };
  const meta: Record<string, unknown> = { width: b.readUInt32BE(16), height: b.readUInt32BE(20), bitDepth: b[24] };
  // Walk chunks (bounded) to list chunk types and detect trailing data after IEND.
  const chunks: string[] = [];
  let p = 8;
  while (p + 12 <= b.length && chunks.length < 4096) {
    const len = b.readUInt32BE(p);
    const type = b.subarray(p + 4, p + 8).toString("latin1");
    chunks.push(type);
    p += 12 + len;
    if (type === "IEND") break;
  }
  meta.chunkTypes = [...new Set(chunks)];
  if (p < b.length) meta.trailingBytesAfterIEND = b.length - p;
  return meta;
}

function pcapMetadata(b: Buffer): Record<string, unknown> {
  if (b.length < 24) return { error: "truncated pcap" };
  const magic = b.readUInt32BE(0);
  const le = magic === 0xd4c3b2a1 || magic === 0x4d3cb2a1;
  const r32 = (o: number) => (le ? b.readUInt32LE(o) : b.readUInt32BE(o));
  const linkType = r32(20);
  let p = 24;
  let packets = 0;
  let first: number | null = null;
  let last: number | null = null;
  while (p + 16 <= b.length && packets < 1_000_000) {
    const ts = r32(p);
    const incl = r32(p + 8);
    first ??= ts;
    last = ts;
    p += 16 + incl;
    packets++;
  }
  return {
    linkType: linkType === 1 ? "Ethernet" : `linktype ${linkType}`,
    packets,
    firstPacket: first ? new Date(first * 1000).toISOString() : null,
    lastPacket: last ? new Date(last * 1000).toISOString() : null,
  };
}

function wavMetadata(b: Buffer): Record<string, unknown> {
  if (b.length < 44) return { error: "truncated WAV" };
  return { channels: b.readUInt16LE(22), sampleRate: b.readUInt32LE(24), bitsPerSample: b.readUInt16LE(34) };
}

function zipSummary(report: ArchiveReport): Record<string, unknown> {
  return {
    entries: report.entries.slice(0, 200).map((e) => ({ name: e.name, size: e.uncompressedSize, encrypted: e.encrypted })),
    entryCount: report.entries.length,
    totalUncompressed: report.totalUncompressed,
  };
}

export function inspectFile(buf: Buffer): FileInspection {
  const detectedType = detectType(buf);
  const metadata: Record<string, unknown> = {};
  const blockingProblems: string[] = [];
  switch (detectedType) {
    case "elf":
      Object.assign(metadata, elfMetadata(buf));
      break;
    case "png":
      Object.assign(metadata, pngMetadata(buf));
      break;
    case "pcap":
      Object.assign(metadata, pcapMetadata(buf));
      break;
    case "wav":
      Object.assign(metadata, wavMetadata(buf));
      break;
    case "zip": {
      const report = inspectZip(buf);
      Object.assign(metadata, zipSummary(report));
      blockingProblems.push(...report.problems);
      break;
    }
    case "text":
      metadata.lines = buf.toString("utf8").split("\n").length;
      break;
    default:
      break;
  }
  return { detectedType, mimeType: MIME[detectedType], metadata, blockingProblems };
}
