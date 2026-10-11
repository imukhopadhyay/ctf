/**
 * Development seed. Idempotent. Creates categories, achievements, an admin
 * (password from SEED_ADMIN_PASSWORD — no default), an organizer, sample
 * participants, two competitions and at least two challenges per category with
 * synthetic flags. When challenge artifacts have been generated
 * (challenges/generate-artifacts.ts), their static flags and files are wired in.
 *
 * Run: npm run db:seed
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { PrismaClient, type Prisma } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import { createHmac } from "node:crypto";

const db = new PrismaClient();
const FLAG_PEPPER = process.env.FLAG_PEPPER;
if (!FLAG_PEPPER || FLAG_PEPPER.length < 32) {
  console.error("FLAG_PEPPER must be set (>=32 chars) to seed flags. Load your .env first.");
  process.exit(1);
}

const argon = (pw: string) => hash(pw, { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 });
const digest = (flag: string, rule: { caseSensitive: boolean; normalizeWhitespace: boolean }) => {
  let v = flag.normalize("NFC").trim();
  if (rule.normalizeWhitespace) v = v.replace(/\s+/gu, " ");
  if (!rule.caseSensitive) v = v.toLowerCase();
  return createHmac("sha256", FLAG_PEPPER!).update(`flag:v1:${v}`, "utf8").digest("hex");
};

type Manifest = Record<string, { file: string; sha256: string; flag: string; caseSensitive: boolean }>;
const manifestPath = path.join(__dirname, "..", "challenges", "build", "artifacts", "manifest.json");
const manifest: Manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};

async function upsertUser(email: string, username: string, displayName: string, role: Prisma.UserCreateInput["role"], password: string) {
  const passwordHash = await argon(password);
  return db.user.upsert({
    where: { email },
    create: { email, username, displayName, role, passwordHash },
    update: { role, displayName },
  });
}

async function flagFor(challengeId: string, flag: string, caseSensitive = true, type: "STATIC" | "INSTANCE" = "STATIC") {
  const existing = await db.flagConfiguration.findFirst({ where: { challengeId } });
  if (existing) return;
  await db.flagConfiguration.create({
    data: {
      challengeId, type, label: "flag", caseSensitive, normalizeWhitespace: false,
      digest: type === "STATIC" ? digest(flag, { caseSensitive, normalizeWhitespace: false }) : null,
    },
  });
}

async function artifactFor(challengeId: string, key: string, description: string, uploadedById: string) {
  const m = manifest[key];
  if (!m) return;
  const buf = readFileSync(path.join(path.dirname(manifestPath), m.file));
  if (await db.challengeArtifact.findFirst({ where: { challengeId, filename: m.file } })) return;
  const { artifactStore } = await import("../src/server/storage");
  const { inspectFile } = await import("../src/server/domain/file-inspect");
  const stored = await artifactStore().put(buf);
  const inspection = inspectFile(buf);
  await db.challengeArtifact.create({
    data: {
      challengeId, filename: m.file, storageKey: stored.key, sha256: stored.sha256, sizeBytes: stored.size,
      mimeType: inspection.mimeType, detectedType: inspection.detectedType, metadata: inspection.metadata as Prisma.InputJsonValue,
      description, uploadedById,
    },
  });
}

async function main() {
  // Categories
  const categoryDefs = [
    { slug: "web", name: "Web Exploitation", icon: "globe", description: "Find and exploit flaws in intentionally vulnerable web applications running in isolated sandboxes.", sortOrder: 0 },
    { slug: "crypto", name: "Cryptography", icon: "key", description: "Break classical ciphers, decode encodings and analyse weak or toy encryption.", sortOrder: 1 },
    { slug: "reverse", name: "Reverse Engineering", icon: "binary", description: "Analyse compiled programs statically, recover secrets and understand control flow.", sortOrder: 2 },
    { slug: "forensics", name: "Digital Forensics", icon: "file-search", description: "Investigate synthetic evidence — captures, logs, images and hidden data.", sortOrder: 3 },
  ];
  const categories: Record<string, string> = {};
  for (const c of categoryDefs) {
    const row = await db.challengeCategory.upsert({ where: { slug: c.slug }, create: c, update: { name: c.name, description: c.description, icon: c.icon, sortOrder: c.sortOrder } });
    categories[c.slug] = row.id;
  }

  // Achievements
  const achievements = [
    { key: "first-blood", name: "First Blood", description: "Be the first to solve a challenge.", icon: "droplet", xp: 100, scope: "USER" as const, criteria: { type: "first_blood", count: 1 } },
    { key: "crypto-specialist", name: "Cryptography Specialist", description: "Solve 3 cryptography challenges.", icon: "key", xp: 150, scope: "USER" as const, criteria: { type: "category_solves", category: "crypto", count: 3 } },
    { key: "web-expert", name: "Web Exploitation Expert", description: "Solve 3 web challenges.", icon: "globe", xp: 150, scope: "USER" as const, criteria: { type: "category_solves", category: "web", count: 3 } },
    { key: "forensics-investigator", name: "Forensics Investigator", description: "Solve 3 forensics challenges.", icon: "file-search", xp: 150, scope: "USER" as const, criteria: { type: "category_solves", category: "forensics", count: 3 } },
    { key: "reverse-specialist", name: "Reverse Engineering Specialist", description: "Solve 3 reverse challenges.", icon: "binary", xp: 150, scope: "USER" as const, criteria: { type: "category_solves", category: "reverse", count: 3 } },
    { key: "all-rounder", name: "All-Rounder", description: "Solve at least one challenge in every category.", icon: "award", xp: 300, scope: "USER" as const, criteria: { type: "all_categories", categories: ["web", "crypto", "reverse", "forensics"], minEach: 1 } },
    { key: "consistency", name: "Consistency", description: "Solve challenges on 3 consecutive days.", icon: "calendar-days", xp: 200, scope: "USER" as const, criteria: { type: "streak_days", days: 3 } },
    { key: "no-hints", name: "Purist", description: "Solve 5 challenges without using a hint.", icon: "sparkles", xp: 200, scope: "USER" as const, criteria: { type: "hintless_solves", count: 5 } },
    { key: "team-effort", name: "Team Collaboration", description: "A team with solves from at least 2 different members.", icon: "users", xp: 150, scope: "TEAM" as const, criteria: { type: "team_contributors", minMembers: 2 } },
  ];
  for (const a of achievements) {
    await db.achievement.upsert({ where: { key: a.key }, create: a as Prisma.AchievementCreateInput, update: { name: a.name, description: a.description, xp: a.xp, criteria: a.criteria as Prisma.InputJsonValue } });
  }

  // Institution & users
  const inst = await db.institution.upsert({ where: { slug: "aiit-kolkata" }, create: { name: "Amity Institute of Information Technology, Kolkata", slug: "aiit-kolkata" }, update: {} });
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPassword || adminPassword.length < 12) {
    console.error("Set SEED_ADMIN_PASSWORD (>=12 chars) to seed the admin account.");
    process.exit(1);
  }
  const admin = await upsertUser(process.env.SEED_ADMIN_EMAIL ?? "admin@cyberquest.local", "admin", "Platform Admin", "ADMIN", adminPassword);
  const organizer = await upsertUser("organizer@cyberquest.local", "organizer", "Dr. Organizer", "ORGANIZER", process.env.SEED_ORGANIZER_PASSWORD ?? "organizer-dev-passphrase");
  const evaluator = await upsertUser("evaluator@cyberquest.local", "evaluator", "Prof. Evaluator", "EVALUATOR", process.env.SEED_EVALUATOR_PASSWORD ?? "evaluator-dev-passphrase");
  const players = [];
  for (const [u, n] of [["nova", "Nova Rao"], ["cipher", "Cipher Bose"], ["byte", "Byte Sen"], ["trace", "Trace Dutta"]] as const) {
    players.push(await upsertUser(`${u}@student.local`, u, n, "PARTICIPANT", `${u}-dev-passphrase-123`));
  }
  await db.user.updateMany({ where: { id: { in: players.map((p) => p.id) } }, data: { institutionId: inst.id } });

  // Execution environments for the vulnerable web apps (disabled until an admin enables them with a real runner).
  const sqliEnv = await db.executionEnvironment.upsert({
    where: { key: "web-sqli-login" },
    create: { key: "web-sqli-login", name: "SQLi Login Portal", description: "Intentionally vulnerable login (SQL injection).", image: "cyberquest/chal-sqli-login:1.0", protocol: "http", internalPort: 8080, memoryMb: 128, cpuMillis: 250, pidsLimit: 64, ttlMinutes: 30, enabled: false },
    update: {},
  });
  const idorEnv = await db.executionEnvironment.upsert({
    where: { key: "web-idor-notes" },
    create: { key: "web-idor-notes", name: "IDOR NoteKeeper", description: "Insecure direct object reference demo.", image: "cyberquest/chal-idor-notes:1.0", protocol: "http", internalPort: 8080, memoryMb: 128, cpuMillis: 250, pidsLimit: 64, ttlMinutes: 30, enabled: false },
    update: {},
  });

  // ── Competition 1: a live inter-college CTF ──
  const now = Date.now();
  const comp = await db.competition.upsert({
    where: { slug: "cyberquest-open-2026" },
    create: {
      slug: "cyberquest-open-2026", name: "CyberQuest Open 2026", tagline: "An inter-college capture-the-flag competition",
      description: "# Welcome to CyberQuest Open 2026\n\nFour categories, synthetic targets, fair scoring. Good luck!\n\nAll challenges use **safe, synthetic data**. Attack only the targets each challenge provides.",
      status: "ACTIVE", timezone: "Asia/Kolkata", startsAt: new Date(now - 3600_000), endsAt: new Date(now + 14 * 86400_000),
      mode: "TEAM", minTeamSize: 1, maxTeamSize: 4, accessMode: "PUBLIC", scoringModel: "DYNAMIC",
      rules: "1. Attack only the targets a challenge provides.\n2. Do not share flags between teams.\n3. Do not attack the platform itself.\n4. Have fun and learn.", institutionId: inst.id,
      permittedTools: "Any analysis tooling run locally or in the provided sandbox.", prohibitedActivities: "Attacking the platform, other teams, or any third-party system. Flag sharing.",
      hintPenaltiesEnabled: true, solutionDisclosure: "AFTER_END", createdById: organizer.id,
    },
    update: { status: "ACTIVE" },
  });
  await db.competitionStaff.upsert({ where: { competitionId_userId_role: { competitionId: comp.id, userId: organizer.id, role: "ORGANIZER" } }, create: { competitionId: comp.id, userId: organizer.id, role: "ORGANIZER" }, update: {} });
  await db.competitionStaff.upsert({ where: { competitionId_userId_role: { competitionId: comp.id, userId: evaluator.id, role: "EVALUATOR" } }, create: { competitionId: comp.id, userId: evaluator.id, role: "EVALUATOR" }, update: {} });

  async function challenge(data: { slug: string; title: string; category: string; difficulty: Prisma.ChallengeCreateInput["difficulty"]; points: number; description: string; subcategory?: string; accessMethod?: "OFFLINE" | "INSTANCE"; environmentId?: string; gradingMode?: "FLAG" | "MANUAL"; explanation?: string; tags?: string[]; skills?: string[] }) {
    return db.challenge.upsert({
      where: { competitionId_slug: { competitionId: comp.id, slug: data.slug } },
      create: {
        competitionId: comp.id, slug: data.slug, title: data.title, categoryId: categories[data.category]!, subcategory: data.subcategory,
        description: data.description, difficulty: data.difficulty, points: data.points, minPoints: Math.ceil(data.points / 4), decay: 15,
        accessMethod: data.accessMethod ?? "OFFLINE", environmentId: data.environmentId, gradingMode: data.gradingMode ?? "FLAG",
        status: "PUBLISHED", publishedAt: new Date(), flagsTestedAt: new Date(), authorId: organizer.id, reviewerId: evaluator.id,
        explanation: data.explanation ?? "", tags: data.tags ?? [], skills: data.skills ?? [],
      },
      update: { status: "PUBLISHED" },
    });
  }

  // Web (2) — instance-based with per-instance flags
  const web1 = await challenge({ slug: "sqli-login", title: "Portal Breach", category: "web", subcategory: "SQL injection", difficulty: "BEGINNER", points: 150, accessMethod: "INSTANCE", environmentId: sqliEnv.id, tags: ["sqli", "auth-bypass"], skills: ["SQL injection"], description: "The MegaCorp portal login looks flimsy. Log in as **admin** to reveal the flag.\n\nStart your isolated instance, then try classic authentication-bypass payloads in the username field.", explanation: "The query concatenates input directly: `... WHERE username='$u' AND password='$p'`. A payload like `admin'--` comments out the password check. Always use parameterized queries." });
  await flagFor(web1.id, "", true, "INSTANCE");
  const web2 = await challenge({ slug: "idor-notes", title: "Not Your Notes", category: "web", subcategory: "IDOR / broken access control", difficulty: "BEGINNER", points: 150, accessMethod: "INSTANCE", environmentId: idorEnv.id, tags: ["idor", "access-control"], skills: ["Authorization testing"], description: "NoteKeeper lets you read your notes at `/note?id=1`. But are those the only notes?\n\nStart your instance and investigate how notes are addressed.", explanation: "Notes are fetched by sequential id with no ownership check (IDOR). Incrementing the id reveals the admin's private note. Enforce per-object authorization on the server." });
  await flagFor(web2.id, "", true, "INSTANCE");

  // Crypto (2) — offline artifacts
  const cry1 = await challenge({ slug: "caesar-intercept", title: "Et Tu?", category: "crypto", subcategory: "Caesar cipher", difficulty: "BEGINNER", points: 100, tags: ["caesar", "classical"], skills: ["Classical ciphers"], description: "An intercepted transmission uses a classical substitution cipher. Download the message and recover the flag.", explanation: "A Caesar cipher shifts each letter by a fixed amount (here 13 — ROT13). With only 25 possible shifts, brute force is trivial." });
  if (manifest["crypto-caesar"]) await flagFor(cry1.id, manifest["crypto-caesar"].flag);
  await artifactFor(cry1.id, "crypto-caesar", "Intercepted transmission", organizer.id);
  const cry2 = await challenge({ slug: "multistage-cipher", title: "Layers", category: "crypto", subcategory: "Multi-stage", difficulty: "INTERMEDIATE", points: 250, tags: ["base64", "vigenere", "multi-stage"], skills: ["Encoding", "Vigenère cipher"], description: "This puzzle has two layers. Decode, then decrypt. The file explains each step.", explanation: "First Base64-decode (encoding, not encryption). The result instructs you to apply a Vigenère cipher with key `SECURITY`. Encoding ≠ encryption." });
  if (manifest["crypto-multistage"]) await flagFor(cry2.id, manifest["crypto-multistage"].flag);
  await artifactFor(cry2.id, "crypto-multistage", "Two-layer puzzle", organizer.id);

  // Reverse (2)
  const rev1 = await challenge({ slug: "hardcoded-key", title: "Secrets in the Binary", category: "reverse", subcategory: "Static analysis", difficulty: "INTERMEDIATE", points: 200, tags: ["elf", "xor", "static-analysis"], skills: ["Static analysis", "Disassembly"], description: "Download the ELF binary. It checks a key you enter, but the key is derived from an obfuscated table. Recover it through static analysis.\n\n`file` and `objdump -d` are your friends; the reference binary is non-stripped.", explanation: "The flag bytes are stored XOR'd with 0x5A and reconstructed at runtime, so `strings` shows nothing. Disassemble `reveal()` or XOR the `.data` table with 0x5A." });
  if (manifest["reverse-hardcoded-key"]) await flagFor(rev1.id, manifest["reverse-hardcoded-key"].flag);
  await artifactFor(rev1.id, "reverse-hardcoded-key", "Challenge binary (non-stripped)", organizer.id);
  await artifactFor(rev1.id, "reverse-hardcoded-key-stripped", "Challenge binary (stripped — harder)", organizer.id);
  const rev2 = await challenge({ slug: "stack-bounds", title: "Off By One", category: "reverse", subcategory: "Memory safety (analysis)", difficulty: "ADVANCED", points: 300, gradingMode: "MANUAL", tags: ["memory-safety", "write-up"], skills: ["Vulnerability analysis"], description: "Study the provided non-stripped binary from *Secrets in the Binary*. **Write up** the off-by-one risk in a fixed-size buffer copy: where it is, why `-fno-stack-protector` matters, and how to fix it. Graded manually by an evaluator.", explanation: "Fixed-size stack buffers filled from input without bounds checks can overflow adjacent memory. Mitigations: bounds checks, stack canaries, non-executable stacks, ASLR." });

  // Forensics (2)
  const for1 = await challenge({ slug: "pcap-exfil", title: "Leak on the Wire", category: "forensics", subcategory: "Network / PCAP", difficulty: "BEGINNER", points: 150, tags: ["pcap", "http", "network"], skills: ["Packet analysis"], description: "A packet capture caught a workstation beaconing out. Find the exfiltrated credential — the flag is the leaked token.\n\nOpen the PCAP in Wireshark or run `strings` / `tcpflow` over it.", explanation: "Cleartext HTTP exposes everything. The POST to `exfil.attacker.test` carries `token=CQ{...}`. Follow the TCP stream or grep the capture." });
  if (manifest["forensics-exfil"]) await flagFor(for1.id, manifest["forensics-exfil"].flag);
  await artifactFor(for1.id, "forensics-exfil", "Packet capture", organizer.id);
  const for2 = await challenge({ slug: "stego-png", title: "Hidden in Pixels", category: "forensics", subcategory: "Steganography", difficulty: "INTERMEDIATE", points: 200, tags: ["stego", "png", "zip"], skills: ["Steganography", "File carving"], description: "This image looks ordinary, but it is larger than it should be. Something is appended after the image data. Extract it.", explanation: "A complete ZIP archive is appended after the PNG's IEND chunk. `binwalk`, `unzip` on the PNG, or carving from the ZIP signature recovers `secret.txt`." });
  if (manifest["forensics-stego"]) await flagFor(for2.id, manifest["forensics-stego"].flag);
  await artifactFor(for2.id, "forensics-stego", "Suspicious image", organizer.id);

  // Hints on a couple of challenges
  for (const [chId, hints] of [
    [cry1.id, [{ title: "Which cipher?", content: "A Roman general's favourite. Try shifting letters.", cost: 10, order: 1 }, { title: "The shift", content: "13 places — also known as ROT13.", cost: 25, order: 2 }]],
    [rev1.id, [{ title: "First look", content: "Run `strings` — the flag is not there, so it is built at runtime.", cost: 20, order: 1 }]],
  ] as const) {
    for (const h of hints) {
      const existing = await db.hint.findFirst({ where: { challengeId: chId, order: h.order } });
      if (!existing) await db.hint.create({ data: { challengeId: chId, ...h } });
    }
  }

  // Announcement
  if (!(await db.announcement.findFirst({ where: { competitionId: comp.id } }))) {
    await db.announcement.create({ data: { competitionId: comp.id, title: "Competition is live!", body: "All challenges are published. Web challenges require an isolated instance — enable the runner first. Good luck!", pinned: true, createdById: organizer.id } });
  }

  // Register players and build two teams (only if no registrations yet)
  if ((await db.competitionRegistration.count({ where: { competitionId: comp.id } })) === 0) {
    for (const p of players) await db.competitionRegistration.create({ data: { competitionId: comp.id, userId: p.id, status: "APPROVED" } });
    const code = (s: string) => s.toUpperCase().padEnd(10, "X").slice(0, 10);
    const teamA = await db.team.create({ data: { competitionId: comp.id, name: "Null Terminators", nameNormalized: "null terminators", inviteCode: code("nullterm"), captainId: players[0]!.id } });
    const teamB = await db.team.create({ data: { competitionId: comp.id, name: "Segfault Squad", nameNormalized: "segfault squad", inviteCode: code("segfault"), captainId: players[2]!.id } });
    await db.teamMembership.createMany({ data: [
      { teamId: teamA.id, userId: players[0]!.id, competitionId: comp.id, role: "CAPTAIN" },
      { teamId: teamA.id, userId: players[1]!.id, competitionId: comp.id, role: "MEMBER" },
      { teamId: teamB.id, userId: players[2]!.id, competitionId: comp.id, role: "CAPTAIN" },
      { teamId: teamB.id, userId: players[3]!.id, competitionId: comp.id, role: "MEMBER" },
    ] });
  }

  // ── Competition 2: practice arena (open-ended) ──
  await db.competition.upsert({
    where: { slug: "practice-arena" },
    create: {
      slug: "practice-arena", name: "Practice Arena", tagline: "Train any time", description: "An always-open practice ground. Solutions are revealed after you solve.",
      status: "ACTIVE", timezone: "UTC", startsAt: new Date(now - 86400_000), endsAt: null, mode: "INDIVIDUAL", accessMode: "PUBLIC",
      scoringModel: "STATIC", rules: "Practice freely. The responsible-use policy still applies.", isPractice: true, solutionDisclosure: "AFTER_SOLVE", createdById: organizer.id,
    },
    update: { status: "ACTIVE" },
  });

  console.log("Seed complete.");
  console.log(`  Admin:     ${admin.email}`);
  console.log(`  Organizer: organizer@cyberquest.local`);
  console.log(`  Evaluator: evaluator@cyberquest.local`);
  console.log(`  Players:   nova, cipher, byte, trace (@student.local)`);
  console.log(manifest && Object.keys(manifest).length ? "  Offline challenge flags wired from artifact manifest." : "  (Run challenges/generate-artifacts.ts to wire offline flags.)");
  console.log("  Web challenge flags are per-instance; enable the runner and the environments to use them.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(() => db.$disconnect());
