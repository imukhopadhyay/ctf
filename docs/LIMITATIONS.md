# CyberQuest CTF — Known Limitations & Production-Readiness Assessment

Honest accounting of what is implemented, what is stubbed with a safe default,
and what remains before a high-stakes public deployment.

## Implemented and tested

- Local authentication (Argon2id), hashed session tokens, lockout, RBAC with a
  code-defined permission matrix.
- Competitions (full lifecycle + clock), individual and team modes, three access
  modes, registration/approval, staff assignment.
- Challenge authoring with versioning, review workflow, publication validation,
  hints, prerequisites, release/close scheduling, clone.
- Flag engine: static (HMAC) and per-instance (derived) flags, normalization,
  multi-stage, rotation, expiry, flag tester, flag-sharing detection.
- Scoring: static and dynamic, hint/wrong-answer penalties, first blood,
  tie-breaks, append-only ledger, manual adjustments, idempotent recalculation,
  concurrency-safe (advisory lock + unique constraint).
- Leaderboards: live (cached) + freeze + anonymization + category stats +
  progression chart; historical reconstruction from the ledger.
- Teams, achievements/XP/levels, announcements, in-app notifications.
- Artifact store (content-addressed, immutable) with content inspection and
  safe downloads; archive traversal/symlink/bomb protection.
- Challenge runner with a hardened Docker backend (live-tested) and an honest
  disabled default; four challenge categories with ≥2 synthetic challenges each.
- Organizer/evaluator/admin dashboards, analytics, CSV exports, audit log,
  security monitoring.
- 153 automated tests (unit + integration + security + live sandbox); CI with
  typecheck, lint, build, audit and image build.

## Stubbed with a safe, documented default

- **Challenge execution** is **disabled by default** (`RUNNER_BACKEND=disabled`).
  The Docker backend is implemented and tested but must be deployed on a
  dedicated isolated host with a hardened runtime before enabling for untrusted
  participants (`docs/SANDBOX.md`). We never report isolation that is not
  configured.
- **Artifact storage** uses a local content-addressed filesystem adapter. The
  `ArtifactStore` interface is ready for an S3/object-store implementation,
  which is required for multi-node web replicas; that adapter is not yet written.
- **Redis** is optional; without it, rate limits and the leaderboard cache fall
  back to in-process memory, which is correct only for a single instance.

## Not implemented (documented gaps)

- **Institutional SSO (OIDC/SAML)** — local accounts only. The user model and
  RBAC are SSO-ready but no provider integration exists.
- **Email / push delivery** — notifications are in-app only; no outbound email
  (so no email verification or password-reset-by-email yet).
- **OpenAPI document** — the UI and API share one typed codebase; a standalone
  OpenAPI spec would be added if a third-party API service were introduced.
- **gVisor/Kata/Firecracker** runtimes are supported via configuration
  (`RUNNER_DOCKER_RUNTIME`) but not bundled; plain `runc` shares the host kernel.
- **Advanced anti-cheat** beyond rate limits, flag-sharing detection, submission
  fingerprints and audit trails (e.g. ML similarity on write-ups) is not built.
- **Browser-based evidence viewer** — artifacts are download-only by design;
  no in-browser PCAP/hex viewer is provided.
- **i18n / full WCAG audit** — the UI uses semantic markup, labelled controls,
  keyboard focus styles, skip link and accessible contrast, but no formal
  accessibility audit or translations have been done.

## Production-readiness assessment

**Suitable now** for educational use, club/university competitions and
inter-college events on a single well-provisioned deployment with managed
Postgres + Redis, TLS, backups and **execution challenges left disabled** (or
enabled only on a properly isolated runner host per `docs/SANDBOX.md`). Offline
(crypto/reverse/forensics) challenges are fully production-ready.

**Before a large public event with execution challenges**: implement the S3
artifact adapter (for horizontal scaling), stand up the runner on a dedicated
VPC with gVisor/Kata and deny-by-default egress, add email delivery (and
reset), run a dependency + image scan and an external penetration test, and
complete an accessibility audit. Track RPO/RTO and rehearse the recovery drill
in `docs/DEPLOYMENT.md`.

## Residual risks

- A misconfigured runner (socket exposed on a shared host, no egress controls,
  plain `runc` for untrusted code) is the highest-impact risk — hence the
  disabled default and the dedicated-host requirement.
- Rate limits fail **open** if Redis is unreachable (availability over strict
  enforcement); monitor Redis and `RATE_LIMIT` security events.
- The in-code permission matrix must be reviewed whenever roles or endpoints
  change; a gap there is a direct access-control risk.
