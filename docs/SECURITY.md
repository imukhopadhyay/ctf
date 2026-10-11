# CyberQuest CTF — Security Threat Model & Hardening Checklist

Baseline: OWASP ASVS (verification) and OWASP Top 10 (risk identification). The
platform deliberately hosts vulnerable software, so the **core application must
stay secure even though the competition teaches exploitation**. Vulnerable code
lives only in `challenges/` and runs only in the isolated runner.

## 1. Assets to protect

| Asset | Protection |
| --- | --- |
| Flags (the answers) | HMAC-stored or HMAC-derived; never sent to clients; see §4 |
| Participant scores & ranks | append-only ledger, server-authoritative, audited |
| Credentials / sessions | Argon2id, hashed session tokens, `__Host-` cookie |
| Private team data & submissions | authorization on every read |
| Staff-only challenge content (solutions, notes) | excluded from participant projections |
| The platform host itself | challenge code never runs here; strict CSP/headers |
| Challenge artifacts (untrusted) | content-addressed, inspected, download-only |

## 2. Trust boundaries

1. **Browser → web app** — cookie session, Origin/CSRF checks, Zod validation,
   rate limiting, server-side authorization on every service call.
2. **Web app / worker → runner** — HMAC-SHA256 signed requests with timestamp
   and nonce (replay-protected). The app has no container-engine access.
3. **Runner → challenge instance** — hardened container, no egress, per-instance
   network. The instance is hostile by assumption (see `docs/SANDBOX.md`).
4. **Participant-supplied artifacts/inputs** — treated as untrusted everywhere.

## 3. OWASP Top 10 coverage

- **A01 Broken Access Control** — central permission matrix in code
  (`domain/permissions.ts`), re-checked in every service function; participants
  get `404` (not `403`) for unpublished challenges to prevent enumeration;
  IDOR-style access (artifacts, notes, submissions, team data, score ledgers)
  is authorization-checked server-side. Tested in `tests/security`.
- **A02 Cryptographic Failures** — Argon2id password hashing; HMAC flag storage
  with a server-only pepper; `crypto.timingSafeEqual` for flag/signature
  comparison; secure, `SameSite`, `__Host-` session cookies; HSTS in production.
- **A03 Injection** — Prisma parameterized queries throughout; `$queryRawUnsafe`
  /`$executeRawUnsafe` are lint-forbidden; the one raw query (advisory lock)
  uses bound parameters. No HTML injection: React escaping + Markdown rendered
  with `skipHtml` and no `rehype-raw`; write-ups rendered as plain text.
- **A04 Insecure Design** — scoring is an auditable ledger; duplicate/again
  submissions are idempotent; least-privilege roles; honest "execution disabled"
  mode instead of pretending isolation exists.
- **A05 Security Misconfiguration** — strict security headers + per-request
  nonce CSP (`middleware.ts`); `poweredByHeader` off; env validated at boot
  (`env.ts`) and refuses weak secrets; source maps disabled in production.
- **A06 Vulnerable Components** — pinned, lockfiled dependencies; `npm audit`
  in CI; container image scanning hook documented in CI.
- **A07 Identification & Authentication** — rate-limited login, per-account
  lockout after repeated failures, generic error messages, session rotation on
  password change, immediate session revocation on suspend/role change.
- **A08 Software & Data Integrity** — artifacts content-addressed by SHA-256 and
  stored read-only (immutable evidence); runner requests signed; version history
  for challenges.
- **A09 Logging & Monitoring** — `AuditLog` for administrative/scoring actions
  (secrets scrubbed, IPs hashed) and `SecurityEvent` for rate limits, login
  failures, lockouts, access denials, CSRF rejections, suspected flag sharing
  and unsafe uploads, surfaced in the admin security dashboard.
- **A10 SSRF** — the app makes no user-controlled outbound requests; the only
  outbound call is to the configured runner URL. Artifact "fetching" does not
  exist — files are uploaded by staff and stored locally.

## 4. Flag confidentiality (the core invariant)

- Static flags: `digest = HMAC-SHA256(FLAG_PEPPER, normalize(flag, rule), keyVersion)`.
  Only the digest is stored. Rotation bumps `keyVersion`, invalidating old
  digests. Normalization is identical at config time and submit time.
- Per-instance flags: `CQ{HMAC(INSTANCE_FLAG_SECRET, instanceId|challengeId|subjectKey)}`
  — derived on demand, handed only to the isolated container via `$FLAG`, never
  persisted. Submitting another subject's instance flag is rejected and raises a
  `FLAG_SHARING_SUSPECTED` event (verified by live test).
- Submissions store a short keyed **fingerprint** for sharing/duplicate
  analysis — never the submitted value. Audit metadata is scrubbed of anything
  matching `pass|token|secret|flag|cookie|session|digest|invite`.
- Comparison uses fixed-length digests with `timingSafeEqual`; wrong answers
  never reveal the expected value.

Automated tests assert flags, digests and staff-only fields never appear in
participant- or even staff-facing API responses.

## 5. Scoring integrity

- Per-(subject, challenge) Postgres advisory transaction lock serializes
  submissions; `Solve(challengeId, subjectKey)` unique constraint is the final
  guard; `SELECT … FOR UPDATE` on the challenge row serializes first-blood and
  dynamic-value assignment. Client-supplied `points`/`subjectKey`/`userId` are
  ignored. All verified by concurrency tests.

## 6. Rate limits (per fixed window)

Login (per IP and per account), registration, flag submission (per
user+challenge, per subject, per IP), hint unlock, instance create, artifact
download, upload, generic mutations, team join. Redis-backed when configured
(shared across replicas), in-process fallback otherwise.

## 7. File upload / download safety

- Size limit (`MAX_UPLOAD_MB`); magic-byte type detection; ZIP inspected for
  path traversal, symlinks, decompression bombs and excessive entries **without
  extraction**; unsafe archives rejected and logged.
- Downloads are always `Content-Disposition: attachment`, `application/octet-stream`,
  `X-Content-Type-Options: nosniff`, with a `default-src 'none'; sandbox` CSP —
  never rendered inline. Filenames sanitized against traversal and header
  injection.

## 8. Hardening checklist (deploy)

- [ ] `SESSION_SECRET`, `FLAG_PEPPER`, `INSTANCE_FLAG_SECRET` are unique, ≥32
      bytes, from a secrets manager — never committed.
- [ ] TLS terminated in front; `APP_URL` is `https://`; `TRUST_PROXY=true` only
      behind a trusted proxy that sets `X-Forwarded-For`.
- [ ] Redis configured so rate limits and the leaderboard cache work across
      replicas.
- [ ] Database uses a least-privilege application role; backups enabled
      (`docs/DEPLOYMENT.md`).
- [ ] Runner, if enabled, is on a dedicated host/VPC with a hardened runtime
      (`docs/SANDBOX.md`); the app host has no Docker socket.
- [ ] `npm audit` and container image scanning pass in CI.
- [ ] Only reviewed, isolation-tested images are enabled as execution
      environments; `RUNNER_ALLOWED_IMAGES` is set.
- [ ] Admin account password rotated from the seed value; seed accounts removed
      or repurposed in production.

## 9. Responsible disclosure

A vulnerability in the platform itself must be reported privately to the
organizers, never exploited. Exploiting the platform, other participants or
third-party systems is prohibited and grounds for disqualification
(`/help#responsible-use`).
