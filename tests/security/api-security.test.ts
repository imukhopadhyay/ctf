import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { call, tokenFor } from "../helpers/http";
import { buildZip } from "../helpers/zip";
import { makeCategories, makeChallenge, makeCompetition, makeTeam, makeUser, register, resetDb } from "../helpers/factory";
import { storeArtifact } from "@/server/services/artifacts";

import * as adminUsers from "@/app/api/v1/admin/users/route";
import * as adminAudit from "@/app/api/v1/admin/audit/route";
import * as adminSettings from "@/app/api/v1/admin/settings/route";
import * as compScoresAdjust from "@/app/api/v1/competitions/[id]/scores/adjust/route";
import * as compScoresExplain from "@/app/api/v1/competitions/[id]/scores/[subjectKey]/route";
import * as compTeams from "@/app/api/v1/competitions/[id]/teams/route";
import * as compSubmissions from "@/app/api/v1/competitions/[id]/submissions/route";
import * as compStatus from "@/app/api/v1/competitions/[id]/status/route";
import * as chalView from "@/app/api/v1/competitions/[id]/challenges/[challengeId]/route";
import * as chalList from "@/app/api/v1/competitions/[id]/challenges/route";
import * as chalSubmit from "@/app/api/v1/competitions/[id]/challenges/[challengeId]/submit/route";
import * as staffChallenge from "@/app/api/v1/challenges/[id]/route";
import * as staffFlags from "@/app/api/v1/challenges/[id]/flags/route";
import * as uploadRoute from "@/app/api/v1/challenges/[id]/artifacts/route";
import * as download from "@/app/api/v1/artifacts/[id]/download/route";
import * as meSubs from "@/app/api/v1/me/submissions/route";
import * as authLogin from "@/app/api/v1/auth/login/route";
import * as authRegister from "@/app/api/v1/auth/register/route";
import * as authSession from "@/app/api/v1/auth/session/route";
import * as leaderboard from "@/app/api/v1/competitions/[id]/leaderboard/route";

let cats: Record<string, string>;
beforeEach(async () => {
  await resetDb();
  cats = await makeCategories();
});

async function world() {
  const admin = await makeUser("ADMIN");
  const org = await makeUser("ORGANIZER");
  const comp = await makeCompetition(org, { mode: "TEAM" });
  const chal = await makeChallenge(comp.id, cats.crypto!, { flag: "CQ{super_secret_flag_value}", overrides: { solution: "STAFF-ONLY-SOLUTION", instructorNotes: "STAFF-ONLY-NOTES" } });
  const draft = await makeChallenge(comp.id, cats.web!, { flag: "CQ{draft_flag}", overrides: { status: "DRAFT", title: "Unreleased draft" } });
  const [a, b] = await Promise.all([makeUser(), makeUser()]);
  await register(comp.id, a!);
  await register(comp.id, b!);
  const teamA = await makeTeam(comp.id, [a!], "Team A");
  const teamB = await makeTeam(comp.id, [b!], "Team B");
  return {
    admin, org, comp, chal, draft, a: a!, b: b!, teamA, teamB,
    tok: { admin: await tokenFor(admin.id), org: await tokenFor(org.id), a: await tokenFor(a!.id), b: await tokenFor(b!.id) },
  };
}

describe("administrative endpoints", () => {
  it("require authentication (401) and the right role (403)", async () => {
    const w = await world();
    expect((await call(adminUsers.GET)).status).toBe(401);
    expect((await call(adminUsers.GET, { token: w.tok.a })).status).toBe(403);
    expect((await call(adminUsers.GET, { token: w.tok.org })).status).toBe(403);
    expect((await call(adminAudit.GET, { token: w.tok.a })).status).toBe(403);
    expect((await call(adminSettings.PATCH, { method: "PATCH", token: w.tok.a, body: { registrationOpen: false } })).status).toBe(403);
    expect((await call(adminUsers.GET, { token: w.tok.admin })).status).toBe(200);
    expect(await db.securityEvent.count({ where: { type: "ACCESS_DENIED" } })).toBeGreaterThanOrEqual(3);
  });

  it("participants cannot change competition state or list teams/submissions", async () => {
    const w = await world();
    const p = { id: w.comp.id };
    expect((await call(compStatus.POST, { method: "POST", token: w.tok.a, params: p, body: { to: "COMPLETED" } })).status).toBe(403);
    expect((await call(compTeams.GET, { token: w.tok.a, params: p })).status).toBe(403);
    expect((await call(compSubmissions.GET, { token: w.tok.a, params: p })).status).toBe(403);
  });

  it("rejects unknown settings keys (mass assignment)", async () => {
    const w = await world();
    const r = await call(adminSettings.PATCH, { method: "PATCH", token: w.tok.admin, body: { registrationOpen: true, isAdmin: true } });
    expect(r.status).toBe(422);
  });
});

describe("CSRF protection", () => {
  it("rejects state-changing requests from foreign or missing origins", async () => {
    const w = await world();
    const params = { id: w.comp.id, challengeId: w.chal.id };
    const evil = await call(chalSubmit.POST, { method: "POST", token: w.tok.a, params, origin: "https://evil.example", body: { flag: "CQ{super_secret_flag_value}" } });
    expect(evil.status).toBe(403);
    const missing = await call(chalSubmit.POST, { method: "POST", token: w.tok.a, params, origin: null, body: { flag: "x" } });
    expect(missing.status).toBe(403);
    const sameSite = await call(chalSubmit.POST, { method: "POST", token: w.tok.a, params, origin: null, headers: { "sec-fetch-site": "same-origin" }, body: { flag: "CQ{nope}" } });
    expect(sameSite.status).toBe(200);
    expect(await db.securityEvent.count({ where: { type: "CSRF_REJECTED" } })).toBe(2);
  });

  it("requires JSON content type (blocks simple cross-site form posts)", async () => {
    const w = await world();
    const r = await call(chalSubmit.POST, {
      method: "POST", token: w.tok.a, params: { id: w.comp.id, challengeId: w.chal.id },
      rawBody: "flag=x", headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    expect(r.status).toBe(400);
  });
});

describe("flag confidentiality", () => {
  it("participant-facing responses never contain flags, digests or staff-only fields", async () => {
    const w = await world();
    const list = await call(chalList.GET, { token: w.tok.a, params: { id: w.comp.id } });
    const view = await call(chalView.GET, { token: w.tok.a, params: { id: w.comp.id, challengeId: w.chal.id } });
    expect(view.status).toBe(200);
    for (const body of [list.text, view.text]) {
      expect(body).not.toContain("super_secret_flag_value");
      expect(body).not.toContain("STAFF-ONLY");
      expect(body.toLowerCase()).not.toContain("digest");
      expect(body).not.toContain("Unreleased draft");
    }
  });

  it("even staff APIs never return stored flag digests", async () => {
    const w = await world();
    const staff = await call(staffChallenge.GET, { token: w.tok.org, params: { id: w.chal.id } });
    expect(staff.status).toBe(200);
    expect(staff.text).toContain("STAFF-ONLY-SOLUTION");
    expect(staff.text.toLowerCase()).not.toContain("digest");
    const digest = (await db.flagConfiguration.findFirstOrThrow({ where: { challengeId: w.chal.id } })).digest!;
    expect(staff.text).not.toContain(digest);
    const created = await call(staffFlags.POST, { method: "POST", token: w.tok.org, params: { id: w.chal.id }, body: { value: "CQ{another_secret}" } });
    expect(created.status).toBe(200);
    expect(created.text).not.toContain("another_secret");
    expect(created.text.toLowerCase()).not.toContain("digest");
  });

  it("participants cannot read the staff challenge endpoint", async () => {
    const w = await world();
    expect((await call(staffChallenge.GET, { token: w.tok.a, params: { id: w.chal.id } })).status).toBe(403);
  });

  it("unpublished challenges are 404 for participants (no enumeration) and cannot be submitted to", async () => {
    const w = await world();
    const p = { id: w.comp.id, challengeId: w.draft.id };
    expect((await call(chalView.GET, { token: w.tok.a, params: p })).status).toBe(404);
    const s = await call(chalSubmit.POST, { method: "POST", token: w.tok.a, params: p, body: { flag: "CQ{draft_flag}" } });
    expect(s.status).toBe(404);
    expect(await db.solve.count()).toBe(0);
  });
});

describe("score manipulation", () => {
  it("ignores client-supplied points/scores in submissions", async () => {
    const w = await world();
    const r = await call(chalSubmit.POST, {
      method: "POST", token: w.tok.a, params: { id: w.comp.id, challengeId: w.chal.id },
      body: { flag: "CQ{super_secret_flag_value}", points: 999999, subjectKey: `team:${w.teamB.id}`, userId: w.b.id },
    });
    expect(r.status).toBe(200);
    expect(r.json.data.pointsAwarded).toBe(100);
    const solve = await db.solve.findFirstOrThrow();
    expect(solve.teamId).toBe(w.teamA.id);
    expect(solve.userId).toBe(w.a.id);
  });

  it("participants cannot call the adjustment endpoint", async () => {
    const w = await world();
    const r = await call(compScoresAdjust.POST, { method: "POST", token: w.tok.a, params: { id: w.comp.id }, body: { subjectKey: `team:${w.teamA.id}`, points: 5000, reason: "free points" } });
    expect(r.status).toBe(403);
    expect(await db.scoreEvent.count()).toBe(0);
  });

  it("replaying a correct submission does not re-award points", async () => {
    const w = await world();
    const opts = { method: "POST", token: w.tok.a, params: { id: w.comp.id, challengeId: w.chal.id }, body: { flag: "CQ{super_secret_flag_value}" } };
    await call(chalSubmit.POST, opts);
    const replay = await call(chalSubmit.POST, opts);
    expect(replay.json.data.status).toBe("already_solved");
    expect(await db.scoreEvent.count()).toBe(1);
  });
});

describe("cross-team privacy", () => {
  it("a participant cannot read another team's score ledger or submissions", async () => {
    const w = await world();
    await call(chalSubmit.POST, { method: "POST", token: w.tok.b, params: { id: w.comp.id, challengeId: w.chal.id }, body: { flag: "CQ{wrong-b}" } });
    const ledger = await call(compScoresExplain.GET, { token: w.tok.a, params: { id: w.comp.id, subjectKey: `team:${w.teamB.id}` } });
    expect(ledger.status).toBe(403);
    const own = await call(compScoresExplain.GET, { token: w.tok.a, params: { id: w.comp.id, subjectKey: `team:${w.teamA.id}` } });
    expect(own.status).toBe(200);
    const subs = await call(meSubs.GET, { token: w.tok.a });
    expect(subs.json.data.items).toHaveLength(0);
  });

  it("public leaderboard does not expose team invite codes or member emails", async () => {
    const w = await world();
    const lb = await call(leaderboard.GET, { params: { id: w.comp.id } });
    expect(lb.status).toBe(200);
    expect(lb.text).not.toContain(w.teamA.inviteCode);
    expect(lb.text).not.toContain(w.a.email);
  });
});

describe("artifact access control and upload safety", () => {
  it("downloads are forced attachments with nosniff and sandbox CSP; only for visible, published challenges", async () => {
    const w = await world();
    const art = await storeArtifact(w.chal.id, { filename: "../../cipher.txt", data: Buffer.from("URYYB") }, w.org.id);
    expect(art.filename).toBe("cipher.txt");
    const ok = await call(download.GET, { token: w.tok.a, params: { id: art.id } });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(ok.headers.get("content-type")).toBe("application/octet-stream");
    expect(ok.headers.get("x-content-type-options")).toBe("nosniff");
    expect(ok.headers.get("content-security-policy")).toContain("sandbox");
    expect(ok.text).toBe("URYYB");

    const draftArt = await storeArtifact(w.draft.id, { filename: "draft.bin", data: Buffer.from("secret") }, w.org.id);
    expect((await call(download.GET, { token: w.tok.a, params: { id: draftArt.id } })).status).toBe(404);
    const hidden = await storeArtifact(w.chal.id, { filename: "answer-key.txt", data: Buffer.from("key"), visible: false }, w.org.id);
    expect((await call(download.GET, { token: w.tok.a, params: { id: hidden.id } })).status).toBe(404);
    expect((await call(download.GET, { token: w.tok.org, params: { id: hidden.id } })).status).toBe(200);
    expect((await call(download.GET, { params: { id: art.id } })).status).toBe(401);
    const outsider = await makeUser();
    expect((await call(download.GET, { token: await tokenFor(outsider.id), params: { id: art.id } })).status).toBe(404);
  });

  it("rejects malicious archives and oversized uploads, and participants cannot upload", async () => {
    const w = await world();
    const form = (name: string, data: Buffer) => {
      const fd = new FormData();
      fd.set("file", new File([new Uint8Array(data)], name));
      return fd;
    };
    const evilZip = buildZip([{ name: "../../../etc/cron.d/pwn", data: Buffer.from("* * * * * root sh") }]);
    const r1 = await call(uploadRoute.POST, { method: "POST", token: w.tok.org, params: { id: w.chal.id }, rawBody: form("evidence.zip", evilZip) });
    expect(r1.status).toBe(422);
    expect(await db.securityEvent.count({ where: { type: "UNSAFE_UPLOAD_REJECTED" } })).toBe(1);

    const big = Buffer.alloc(3 * 1024 * 1024, 65); // MAX_UPLOAD_MB=2 in tests
    const r2 = await call(uploadRoute.POST, { method: "POST", token: w.tok.org, params: { id: w.chal.id }, rawBody: form("big.txt", big) });
    expect(r2.status).toBe(413);

    const r3 = await call(uploadRoute.POST, { method: "POST", token: w.tok.a, params: { id: w.chal.id }, rawBody: form("x.txt", Buffer.from("x")) });
    expect(r3.status).toBe(403);

    const good = await call(uploadRoute.POST, { method: "POST", token: w.tok.org, params: { id: w.chal.id }, rawBody: form("<script>alert(1)</script>.png", Buffer.from("hello")) });
    expect(good.status).toBe(200);
    expect(good.json.data.filename).not.toMatch(/[<>]/);
    expect(good.json.data.storageKey).toBeUndefined();
  });
});

describe("authentication & session security", () => {
  it("sets an httpOnly SameSite session cookie and never returns the password hash", async () => {
    await call(authRegister.POST, { method: "POST", body: { email: "z@example.test", username: "zed", displayName: "Zed", password: "correct-horse-battery", acceptPolicy: true, role: "ADMIN" } });
    const u = await db.user.findUniqueOrThrow({ where: { username: "zed" } });
    expect(u.role).toBe("PARTICIPANT"); // role in body ignored
    const r = await call(authLogin.POST, { method: "POST", body: { identifier: "zed", password: "correct-horse-battery" } });
    expect(r.status).toBe(200);
    const cookie = r.headers.get("set-cookie")!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(r.text).not.toContain("argon2");
    const session = await call(authSession.GET, { token: cookie.split(";")[0]!.split("=")[1] });
    expect(session.json.data.user.username).toBe("zed");
    expect(session.text).not.toContain("passwordHash");
  });

  it("rejects forged and malformed session tokens", async () => {
    expect((await call(meSubs.GET, { token: "forged-token-value-that-is-long-enough-to-check" })).status).toBe(401);
    expect((await call(meSubs.GET, { token: "short" })).status).toBe(401);
  });

  it("rate limits login attempts per IP", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      statuses.push((await call(authLogin.POST, { method: "POST", body: { identifier: `nobody${i}`, password: "irrelevant-password" } })).status);
    }
    expect(statuses).toContain(429);
  });

  it("returns a uniform validation envelope for bad input", async () => {
    const r = await call(authRegister.POST, { method: "POST", body: { email: "not-an-email" } });
    expect(r.status).toBe(422);
    expect(r.json.ok).toBe(false);
    expect(r.json.error?.code).toBe("VALIDATION_FAILED");
  });
});
