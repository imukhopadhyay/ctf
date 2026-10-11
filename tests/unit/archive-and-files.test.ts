import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { inspectZip, isUnsafeArchivePath } from "@/server/domain/archive-inspect";
import { detectType, inspectFile } from "@/server/domain/file-inspect";
import { contentDisposition, sanitizeFilename } from "@/server/domain/filename";
import { buildZip } from "../helpers/zip";

describe("archive path safety", () => {
  it.each([
    ["../etc/passwd", "parent-directory traversal"],
    ["a/../../b", "parent-directory traversal"],
    ["/abs/path", "absolute path"],
    ["C:/windows/x", "drive-letter path"],
    ["dir\\..\\x", "backslash in entry name"],
    ["ok\0.txt", "NUL byte in entry name"],
  ])("rejects %j", (name, reason) => {
    expect(isUnsafeArchivePath(name)).toBe(reason);
  });
  it("allows normal nested paths", () => {
    expect(isUnsafeArchivePath("evidence/logs/auth.log")).toBeNull();
    expect(isUnsafeArchivePath("..hidden-but-fine.txt")).toBeNull();
  });
});

describe("inspectZip", () => {
  it("accepts a benign archive and lists entries", () => {
    const r = inspectZip(buildZip([{ name: "a.txt", data: Buffer.from("hello") }, { name: "dir/b.txt", data: Buffer.from("x") }]));
    expect(r.ok).toBe(true);
    expect(r.entries.map((e) => e.name)).toEqual(["a.txt", "dir/b.txt"]);
  });
  it("rejects traversal (zip-slip)", () => {
    const r = inspectZip(buildZip([{ name: "../../evil.sh", data: Buffer.from("x") }]));
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toMatch(/traversal/);
  });
  it("rejects symlinks", () => {
    const r = inspectZip(buildZip([{ name: "link", data: Buffer.from("/etc/passwd"), unixMode: 0o120777 }]));
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toMatch(/symbolic link/);
  });
  it("rejects decompression bombs by ratio and total size", () => {
    const r = inspectZip(buildZip([{ name: "bomb.bin", data: Buffer.alloc(1000), declaredSize: 900 * 1024 * 1024 }]));
    expect(r.ok).toBe(false);
    expect(r.problems.join(" ")).toMatch(/compression ratio|too large/);
  });
  it("rejects too many entries", () => {
    const entries = Array.from({ length: 30 }, (_, i) => ({ name: `f${i}`, data: Buffer.from("x") }));
    const r = inspectZip(buildZip(entries), { maxEntries: 10, maxTotalUncompressed: 1e9, maxEntryUncompressed: 1e9, maxCompressionRatio: 100, maxNestingDepth: 5 });
    expect(r.ok).toBe(false);
  });
  it("rejects garbage", () => {
    expect(inspectZip(Buffer.from("not a zip at all, definitely")).ok).toBe(false);
  });
  it("flags duplicate entries", () => {
    const r = inspectZip(buildZip([{ name: "a", data: Buffer.from("1") }, { name: "a", data: Buffer.from("2") }]));
    expect(r.problems.join(" ")).toMatch(/duplicate/);
  });
});

describe("file type detection", () => {
  it("detects common evidence formats by magic bytes", () => {
    expect(detectType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]))).toBe("png");
    expect(detectType(Buffer.from([0xd4, 0xc3, 0xb2, 0xa1, 2, 0, 4, 0]))).toBe("pcap");
    expect(detectType(Buffer.from("%PDF-1.7"))).toBe("pdf");
    expect(detectType(Buffer.from("plain text log line\n"))).toBe("text");
    expect(detectType(Buffer.from([0x00, 0x01, 0x02, 0xff]))).toBe("unknown");
  });
  it("blocks unsafe ZIP uploads during inspection", () => {
    const i = inspectFile(buildZip([{ name: "../x", data: Buffer.from("x") }]));
    expect(i.detectedType).toBe("zip");
    expect(i.blockingProblems.length).toBeGreaterThan(0);
  });
  it("extracts ELF metadata from a real binary", () => {
    const self = execFileSync("readlink", ["-f", "/bin/ls"]).toString().trim();
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const info = inspectFile(readFileSync(self));
    expect(info.detectedType).toBe("elf");
    expect(info.metadata.format).toMatch(/ELF(32|64)/);
    expect(typeof info.metadata.architecture).toBe("string");
    expect(Array.isArray(info.metadata.importedSymbols)).toBe(true);
  });
});

describe("filename sanitization", () => {
  it.each([
    ["../../etc/passwd", "passwd"],
    ["C:\\Windows\\evil.exe", "evil.exe"],
    ['a"b<c>.txt', "abc.txt"],
    ["..", "artifact.bin"],
    [".bashrc", "bashrc"],
    ["con.txt", "_con.txt"],
    ["name\r\nX-Injected: 1", "nameX-Injected 1"],
  ])("%j -> %j", (input, out) => {
    expect(sanitizeFilename(input)).toBe(out);
  });
  it("produces header-safe Content-Disposition", () => {
    const v = contentDisposition('evil"\r\nSet-Cookie: x=1;.txt');
    expect(v).not.toMatch(/[\r\n]/);
    expect(v.startsWith("attachment;")).toBe(true);
  });
});
