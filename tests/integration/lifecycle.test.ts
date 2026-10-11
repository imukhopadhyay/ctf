import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { login, registerUser } from "@/server/services/auth";
import { validateSessionToken, revokeSession } from "@/server/auth/session";
import {
  assignStaff,
  createCompetition,
  decideRegistration,
  registerForCompetition,
  setInviteCode,
  transitionCompetition,
  updateCompetition,
} from "@/server/services/competitions";
import {
  createChallenge,
  getChallengeView,
  listChallenges,
  setChallengeStatus,
  submitReview,
  updateChallenge,
} from "@/server/services/challenges";
import { addFlag, testFlag, rotateFlag } from "@/server/services/flags";
import { submitFlag, submitWriteup, gradeSubmission } from "@/server/services/submissions";
import { createTeam, joinTeam, leaveTeam, getMyTeam } from "@/server/services/teams";
import { runCompetitionClock } from "@/server/services/worker-tasks";
import { ip, makeCategories, makeChallenge, makeCompetition, makeUser, register, resetDb } from "../helpers/factory";

let cats: Record<string, string>;
beforeEach(async () => {
  await resetDb();
  cats = await makeCategories();
});

describe("authentication", () => {
  const input = { email: "Alice@Example.test", username: "Alice_01", displayName: "Alice", password: "a-long-unique-passphrase", acceptPolicy: true as const };

  it("registers, logs in with username or email, and validates the session", async () => {
    const user = await registerUser({ ...input, email: input.email.toLowerCase(), username: input.username.toLowerCase() }, { ip: "1.1.1.1" });
    const stored = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.role).toBe("PARTICIPANT");
    expect(stored.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(stored.passwordHash).not.toContain(input.password);

    const { session } = await login({ identifier: "alice_01", password: input.password }, { ip: "1.1.1.1", userAgent: "vitest" });
    expect((await validateSessionToken(session.token))?.id).toBe(user.id);
    // Only the token hash is stored.
    expect(await db.session.count({ where: { id: session.token } })).toBe(0);
    const viaEmail = await login({ identifier: "alice@example.test", password: input.password }, { ip: "1.1.1.1", userAgent: null });
    await revokeSession(viaEmail.session.token);
    expect(await validateSessionToken(viaEmail.session.token)).toBeNull();
  });

  it("rejects weak passwords and duplicate accounts with generic errors", async () => {
    await expect(registerUser({ ...input, email: "b@example.test", username: "bob", password: "short" }, { ip: "2.2.2.2" })).rejects.toThrow(/12 characters/);
    await registerUser({ ...input, email: "c@example.test", username: "carol" }, { ip: "2.2.2.3" });
    await expect(registerUser({ ...input, email: "c@example.test", username: "carol2" }, { ip: "2.2.2.4" })).rejects.toThrow(/already exists/);
  });

  it("locks the account after repeated failures and records security events", async () => {
    await registerUser({ ...input, email: "d@example.test", username: "dave" }, { ip: "3.3.3.3" });
    for (let i = 0; i < 5; i++) {
      await expect(login({ identifier: "dave", password: "wrong-password-123" }, { ip: `3.3.3.${i}`, userAgent: null })).rejects.toThrow(/Invalid/);
    }
    await expect(login({ identifier: "dave", password: input.password }, { ip: "3.3.3.9", userAgent: null })).rejects.toThrow(/locked/);
    expect(await db.securityEvent.count({ where: { type: "ACCOUNT_LOCKED" } })).toBe(1);
  });

  it("does not reveal whether an account exists", async () => {
    await expect(login({ identifier: "nobody", password: "whatever-password" }, { ip: "4.4.4.4", userAgent: null })).rejects.toThrow("Invalid username/email or password.");
  });

  it("suspended users lose their sessions", async () => {
    const u = await registerUser({ ...input, email: "e@example.test", username: "erin" }, { ip: "5.5.5.5" });
    const { session } = await login({ identifier: "erin", password: input.password }, { ip: "5.5.5.5", userAgent: null });
    await db.user.update({ where: { id: u.id }, data: { status: "SUSPENDED" } });
    expect(await validateSessionToken(session.token)).toBeNull();
  });
});

describe("competition lifecycle", () => {
  const base = {
    name: "Inter-College CTF",
    slug: "intercollege-2026",
    startsAt: new Date(Date.now() + 3600_000),
    endsAt: new Date(Date.now() + 48 * 3600_000),
    rules: "Attack only provided targets. Do not share flags. Be kind.",
  };

  it("admin creates a competition, assigns staff, validates and publishes it", async () => {
    const admin = await makeUser("ADMIN");
    const organizer = await makeUser("ORGANIZER");
    const evaluator = await makeUser("EVALUATOR");
    const participant = await makeUser();
    const comp = await createCompetition(admin, base as never);
    expect(comp.status).toBe("DRAFT");
    await assignStaff(admin, comp.id, organizer.username, "ORGANIZER");
    await assignStaff(admin, comp.id, evaluator.username, "EVALUATOR");
    await expect(assignStaff(admin, comp.id, participant.username, "ORGANIZER")).rejects.toThrow(/cannot be assigned/);
    await expect(assignStaff(admin, comp.id, evaluator.username, "ORGANIZER")).rejects.toThrow(/cannot be assigned/);

    // Not publishable without a published challenge.
    await expect(transitionCompetition(organizer, comp.id, "SCHEDULED")).rejects.toThrow(/not ready/);
    await makeChallenge(comp.id, cats.crypto!, { flag: "CQ{x}" });
    await transitionCompetition(organizer, comp.id, "SCHEDULED");
    await expect(transitionCompetition(organizer, comp.id, "COMPLETED")).rejects.toThrow(/Cannot move/);
    await expect(transitionCompetition(evaluator, comp.id, "ACTIVE")).rejects.toThrow(/permission/);
    expect(await db.auditLog.count({ where: { action: { in: ["competition.create", "competition.staff.assign", "competition.status"] } } })).toBe(4);
  });

  it("participants and unassigned organizers cannot create or configure competitions they do not own", async () => {
    const p = await makeUser();
    await expect(createCompetition(p, base as never)).rejects.toThrow(/permission/);
    const o1 = await makeUser("ORGANIZER");
    const o2 = await makeUser("ORGANIZER");
    const comp = await createCompetition(o1, base as never);
    await expect(updateCompetition(o2, comp.id, { name: "Hijacked" })).rejects.toThrow(/permission/);
  });

  it("worker clock activates and completes competitions on schedule", async () => {
    const o = await makeUser("ORGANIZER");
    const c = await makeCompetition(o, { status: "SCHEDULED", startsAt: new Date(Date.now() - 1000), endsAt: new Date(Date.now() + 3600_000) });
    expect(await runCompetitionClock()).toBe(1);
    expect((await db.competition.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("ACTIVE");
    expect(await runCompetitionClock(new Date(Date.now() + 2 * 3600_000))).toBe(1);
    expect((await db.competition.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("COMPLETED");
  });

  it("supports public, private (approval) and invitation registration", async () => {
    const o = await makeUser("ORGANIZER");
    const pub = await makeCompetition(o);
    const priv = await makeCompetition(o, { accessMode: "PRIVATE" });
    const inv = await makeCompetition(o, { accessMode: "INVITATION" });
    await setInviteCode(o, inv.id, "SPRING-2026");
    const p = await makeUser();
    expect((await registerForCompetition(p, pub.id)).status).toBe("APPROVED");
    const pending = await registerForCompetition(p, priv.id);
    expect(pending.status).toBe("PENDING");
    await expect(registerForCompetition(p, inv.id, "WRONG-CODE")).rejects.toThrow(/invitation/);
    expect((await registerForCompetition(p, inv.id, "spring-2026")).status).toBe("APPROVED");
    await decideRegistration(o, priv.id, pending.id, "APPROVED");
    expect((await db.competitionRegistration.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe("APPROVED");
    // Staff cannot register for their own competition.
    await expect(registerForCompetition(o, pub.id)).rejects.toThrow(/staff/);
  });
});

describe("challenge authoring and visibility", () => {
  it("organizer creates, tests and publishes; participants only see published challenges", async () => {
    const o = await makeUser("ORGANIZER");
    const comp = await makeCompetition(o);
    const p = await makeUser();
    await register(comp.id, p);
    const chal = await createChallenge(o, comp.id, {
      title: "Caesar's Secret", slug: "caesar", categoryId: cats.crypto!, description: "Decrypt the intercepted message to find the flag.",
      solution: "ROT13", instructorNotes: "Discuss substitution ciphers", explanation: "Shift ciphers have 25 keys",
    } as never);
    expect((await listChallenges(p, comp.id)).challenges).toHaveLength(0);
    await expect(getChallengeView(p, comp.id, chal.id)).rejects.toThrow(/not found/);

    await expect(setChallengeStatus(o, chal.id, "PUBLISHED")).rejects.toThrow(/not ready/);
    await addFlag(o, chal.id, { value: "CQ{rot13_is_not_encryption}" });
    await expect(setChallengeStatus(o, chal.id, "PUBLISHED")).rejects.toThrow(/not ready/); // untested
    expect((await testFlag(o, chal.id, "CQ{nope}")).matched).toBe(false);
    expect((await testFlag(o, chal.id, "CQ{rot13_is_not_encryption}")).matched).toBe(true);
    await setChallengeStatus(o, chal.id, "PUBLISHED");

    const view = await getChallengeView(p, comp.id, chal.id);
    expect(view.locked).toBe(false);
    const json = JSON.stringify(view);
    for (const secret of ["rot13_is_not_encryption", "Discuss substitution", "digest"]) expect(json).not.toContain(secret);
    // Explanation is withheld until the competition ends (default AFTER_END).
    expect(view.locked === false && view.explanation).toBeNull();
    // Testing does not create submissions or score.
    expect(await db.submission.count()).toBe(0);
  });

  it("versions every edit and rotation invalidates old flags", async () => {
    const o = await makeUser("ORGANIZER");
    const comp = await makeCompetition(o);
    const chal = await makeChallenge(comp.id, cats.web!, { flag: "CQ{old}" });
    await db.challengeVersion.create({ data: { challengeId: chal.id, version: 1, snapshot: {} } });
    const updated = await updateChallenge(o, chal.id, { points: 250, changeNote: "Rebalanced" });
    expect(updated.version).toBe(2);
    const v = await db.challengeVersion.findUniqueOrThrow({ where: { challengeId_version: { challengeId: chal.id, version: 2 } } });
    expect(v.changeNote).toBe("Rebalanced");
    expect(JSON.stringify(v.snapshot)).not.toMatch(/CQ\{/);

    const flag = await db.flagConfiguration.findFirstOrThrow({ where: { challengeId: chal.id } });
    await rotateFlag(o, chal.id, flag.id, "CQ{new}");
    const p = await makeUser();
    await register(comp.id, p);
    expect((await submitFlag(p, comp.id, chal.id, "CQ{old}", ip)).status).toBe("incorrect");
    expect((await submitFlag(p, comp.id, chal.id, "CQ{new}", ip)).status).toBe("correct");
  });

  it("prerequisites lock challenges until solved and release schedules hide future challenges", async () => {
    const o = await makeUser("ORGANIZER");
    const comp = await makeCompetition(o);
    const first = await makeChallenge(comp.id, cats.forensics!, { flag: "CQ{stage1}" });
    const second = await makeChallenge(comp.id, cats.forensics!, { flag: "CQ{stage2}", overrides: { prerequisites: { connect: [{ id: first.id }] } } as never });
    const future = await makeChallenge(comp.id, cats.forensics!, { flag: "CQ{later}", overrides: { releaseAt: new Date(Date.now() + 3600_000) } });
    const p = await makeUser();
    await register(comp.id, p);
    const list = (await listChallenges(p, comp.id)).challenges;
    expect(list.map((c) => c.id).sort()).toEqual([first.id, second.id].sort());
    expect(list.find((c) => c.id === second.id)!.locked).toBe(true);
    expect((await getChallengeView(p, comp.id, second.id)).locked).toBe(true);
    await expect(submitFlag(p, comp.id, second.id, "CQ{stage2}", ip)).rejects.toThrow(/prerequisite/);
    await expect(submitFlag(p, comp.id, future.id, "CQ{later}", ip)).rejects.toThrow(/not found/);
    await submitFlag(p, comp.id, first.id, "CQ{stage1}", ip);
    expect((await submitFlag(p, comp.id, second.id, "CQ{stage2}", ip)).status).toBe("correct");
  });

  it("evaluators review challenges and grade manual write-ups", async () => {
    const o = await makeUser("ORGANIZER");
    const ev = await makeUser("EVALUATOR");
    const comp = await makeCompetition(o);
    await db.competitionStaff.create({ data: { competitionId: comp.id, userId: ev.id, role: "EVALUATOR" } });
    const chal = await makeChallenge(comp.id, cats.forensics!, { points: 300, overrides: { gradingMode: "MANUAL", status: "IN_REVIEW", authorId: o.id } });
    await submitReview(ev, chal.id, { verdict: "APPROVE", qualityRating: 5, educationalRating: 4, comments: "Clear objectives" });
    expect((await db.challenge.findUniqueOrThrow({ where: { id: chal.id } })).status).toBe("APPROVED");
    await setChallengeStatus(o, chal.id, "PUBLISHED");

    const p = await makeUser();
    await register(comp.id, p);
    const w = (await submitWriteup(p, comp.id, chal.id, "Timeline: attacker logged in at 02:14 via stolen key, then exfiltrated data.", ip)) as { status: string; submissionId?: string };
    expect(w.status).toBe("pending_review");
    await expect(submitWriteup(p, comp.id, chal.id, "Another attempt with enough characters in it.", ip)).rejects.toThrow(/awaiting/);
    const res = await gradeSubmission(ev, w.submissionId!, { accept: true, points: 250, feedback: "Good analysis" });
    expect(res).toEqual({ accepted: true, points: 250 });
    expect((await db.scoreEvent.findFirstOrThrow({ where: { type: "MANUAL_GRADE" } })).points).toBe(250);
    await expect(gradeSubmission(ev, w.submissionId!, { accept: true, feedback: "" })).rejects.toThrow(/already been graded/);
    await expect(gradeSubmission(p, w.submissionId!, { accept: true, feedback: "" })).rejects.toThrow();
  });
});

describe("teams", () => {
  async function teamComp(overrides = {}) {
    const o = await makeUser("ORGANIZER");
    const comp = await makeCompetition(o, { mode: "TEAM", maxTeamSize: 2, status: "SCHEDULED", startsAt: new Date(Date.now() + 3600_000), ...overrides });
    return { o, comp };
  }

  it("creates a team, joins by invitation code, enforces size and uniqueness", async () => {
    const { comp } = await teamComp();
    const [a, b, c] = await Promise.all([makeUser(), makeUser(), makeUser()]);
    for (const u of [a!, b!, c!]) await register(comp.id, u);
    const team = await createTeam(a!, comp.id, "Packet Sniffers");
    await expect(createTeam(b!, comp.id, "packet   SNIFFERS")).rejects.toThrow(/taken/);
    await expect(createTeam(a!, comp.id, "Second Team")).rejects.toThrow(/already/);
    await expect(joinTeam(b!, comp.id, "WRONGCODE1")).rejects.toThrow(/not found/);
    await joinTeam(b!, comp.id, team.inviteCode.toLowerCase());
    await expect(joinTeam(c!, comp.id, team.inviteCode)).rejects.toThrow(/full/);
    const mine = await getMyTeam(b!, comp.id);
    expect(mine.team?.contributions).toHaveLength(2);
    expect(mine.team?.inviteCode).toBe(team.inviteCode);
  });

  it("concurrent joins cannot exceed the team size limit", async () => {
    const { comp } = await teamComp({ maxTeamSize: 3 });
    const users = await Promise.all(Array.from({ length: 6 }, () => makeUser()));
    for (const u of users) await register(comp.id, u);
    const team = await createTeam(users[0]!, comp.id, "Racers");
    const results = await Promise.allSettled(users.slice(1).map((u) => joinTeam(u, comp.id, team.inviteCode)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect(await db.teamMembership.count({ where: { teamId: team.id } })).toBe(3);
  });

  it("locks membership changes while running unless allowed, and transfers captaincy on leave", async () => {
    const { comp } = await teamComp();
    const [a, b] = await Promise.all([makeUser(), makeUser()]);
    for (const u of [a!, b!]) await register(comp.id, u);
    const team = await createTeam(a!, comp.id, "Leavers");
    await joinTeam(b!, comp.id, team.inviteCode);
    await db.competition.update({ where: { id: comp.id }, data: { status: "ACTIVE", startsAt: new Date(Date.now() - 1000) } });
    await expect(leaveTeam(a!, comp.id)).rejects.toThrow(/locked/);
    await db.competition.update({ where: { id: comp.id }, data: { allowTeamChangesWhileActive: true } });
    await leaveTeam(a!, comp.id);
    expect((await db.team.findUniqueOrThrow({ where: { id: team.id } })).captainId).toBe(b!.id);
  });

  it("users must be registered before joining", async () => {
    const { comp } = await teamComp();
    const u = await makeUser();
    await expect(createTeam(u, comp.id, "Ghosts")).rejects.toThrow(/Register/);
  });
});
