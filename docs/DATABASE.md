# CyberQuest CTF — Database Design

PostgreSQL via Prisma (`prisma/schema.prisma`). Normalized; foreign keys,
unique constraints and indexes throughout; UTC `timestamptz`; enum status
fields. The source of truth for scores is an append-only event ledger.

## The scoring subject

Score-bearing rows (`Submission`, `Solve`, `ScoreEvent`, `HintUnlock`,
`ChallengeInstance`) carry a `subjectKey`: `team:<id>` in team mode or
`user:<id>` in individual mode. One schema serves both modes while keeping
database-level uniqueness (`Solve(challengeId, subjectKey)` unique).

## Model groups

**Identity & access** — `User` (Argon2id hash, lockout fields), `Session`
(stores only the SHA-256 of the token), `Institution`, `CompetitionStaff`
(per-competition ORGANIZER/EVALUATOR). Global `Role` + the in-code permission
matrix decide capabilities; staff rows grant competition-scoped rights.

**Competitions** — `Competition` (lifecycle status, schedule, mode, access
mode, scoring model, tie-break, freeze, penalties, disclosure policy),
`CompetitionRegistration` (unique per user+competition), `Team` +
`TeamMembership` (unique per user+competition → one team per competition).

**Challenges** — `Challenge` (content, difficulty, scoring, access method,
grading mode, staff-only solution/notes, version counter), `ChallengeVersion`
(immutable snapshots, never containing flags), `ChallengeCategory`,
`ChallengeArtifact` (content-addressed, SHA-256, detected type, metadata),
`FlagConfiguration` (digest only for static; derived for instance),
`Hint` + `HintUnlock`, `ExecutionEnvironment` (admin-approved images),
`ChallengeInstance` + `ChallengeInstanceEvent`, `ChallengeReview`,
self-relation `ChallengePrerequisites`.

**Submissions & scoring** — `Submission` (result, keyed fingerprint — never the
value), `Solve` (unique per challenge+subject, first-blood flag), `ScoreEvent`
(append-only signed-points ledger with type, reason and actor).

**Gamification** — `Achievement` (JSON criteria), `UserAchievement`,
`TeamAchievement`.

**Communication** — `Announcement`, `Notification`.

**Audit & platform** — `AuditLog` (secrets scrubbed, IPs hashed), `SecurityEvent`,
`PlatformSetting`, `Job` (durable background-job queue).

## Integrity highlights

- Historical leaderboard reconstruction: recompute standings from `ScoreEvent` +
  `Solve` at any cutoff (used by the freeze feature and recalculation).
- Duplicate-solve prevention: advisory lock + `Solve` unique constraint.
- Deletion policies: cascades for owned children; `SetNull` for optional actor
  references so audit/score history survives user or competition changes.
- No unnecessary PII: email, username, display name and optional institution.

## Migrations

`prisma/migrations/` holds the SQL history. `npm run db:migrate:dev` creates a
new migration in development; `npm run db:migrate` (`prisma migrate deploy`)
applies them in production.
