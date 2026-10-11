# CyberQuest CTF

A production-oriented, gamified **Capture-the-Flag** platform for universities,
clubs, faculty labs and corporate security training. Participants solve web,
cryptography, reverse-engineering and forensics challenges in isolated
environments and submit flags for points; organizers run competitions end to
end; administrators manage the platform.

This is a working application, not a mockup: authentication, RBAC, flag
validation, scoring, leaderboards, teams, hints, achievements, audit logging,
artifact handling and a sandboxed challenge runner are all implemented and
covered by automated tests.

## Highlights

- **Server-authoritative everything.** Scores derive from an append-only
  `ScoreEvent` ledger; the client never supplies points or ranks. Flags are
  verified only on the server.
- **Flags are never exposed.** Static flags are stored as
  `HMAC-SHA256(FLAG_PEPPER, normalize(flag))`; per-instance flags are derived
  with HMAC and never stored. No plaintext flag ever reaches the browser,
  an API response, the HTML, the JS bundle or a source map.
- **Concurrency-safe scoring.** A per-(subject, challenge) advisory lock plus a
  unique constraint make duplicate solves and race conditions impossible to
  double-score.
- **Real isolation.** Execution challenges run only in the separate runner
  service, in hardened containers (dropped capabilities, non-root, read-only
  rootfs, no egress, resource limits). The app never executes challenge code.
- **Four challenge categories** with at least two illustrative, synthetic
  challenges each, plus an artifact store with content inspection.
- **Full role model:** platform administrator, competition organizer, faculty
  evaluator and participant, with server-enforced permissions.

See `docs/ARCHITECTURE.md` for the design and `docs/` for the full set.

## Tech stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 ·
PostgreSQL 16 + Prisma 6 · Redis (optional) · Argon2id · Vitest · Docker.

## Quick start (Docker Compose)

```bash
cp .env.example .env
# Generate the three required secrets:
for k in SESSION_SECRET FLAG_PEPPER INSTANCE_FLAG_SECRET; do
  echo "$k=$(openssl rand -hex 32)"
done   # paste the output into .env
docker compose up --build        # db, redis, migrate, web, worker

# Seed development data (admin/organizer/participants, 2 competitions):
SEED_ADMIN_PASSWORD='choose-a-strong-one' docker compose run --rm \
  -e SEED_ADMIN_PASSWORD web npx tsx --conditions=react-server prisma/seed.ts
```

Open <http://localhost:3000>. Health probe: <http://localhost:3000/api/health>.

Execution-based (web exploitation) challenges stay **disabled** until you stand
up the runner on a dedicated host — read `docs/SANDBOX.md` first. Offline
artifacts (crypto, reverse, forensics) work out of the box.

## Local development (without Docker)

Requires Node 22, PostgreSQL 16 and (optionally) Redis.

```bash
npm install
cp .env.example .env            # fill in DATABASE_URL + the three secrets
createdb cyberquest             # and a 'cyberquest_test' database for tests
npm run db:migrate:dev          # apply migrations
npx tsx challenges/generate-artifacts.ts   # build synthetic challenge artifacts
SEED_ADMIN_PASSWORD='...' npm run db:seed  # development data
npm run dev                     # http://localhost:3000
npm run worker                  # background worker (separate terminal)
```

## Challenge content

```bash
npx tsx challenges/generate-artifacts.ts   # offline crypto/forensics/reverse artifacts
bash challenges/build.sh                    # build the two vulnerable web images (needs Docker)
```

The seed wires the generated static flags automatically. Web-app flags are
per-instance. See `challenges/README.md`.

## Tests

```bash
npm test                 # unit + integration + security (needs cyberquest_test DB)
npm run test:report      # writes reports/TEST-REPORT.md (honest pass/fail/skip)
RUN_DOCKER_TESTS=1 npm test   # also run the live runner/sandbox tests (needs Docker + built image)
npm run typecheck && npm run lint && npm run build
```

Unit tests cover flag matching/normalization, scoring maths (static + dynamic),
tie-breaks, hint penalties, team aggregation, achievement rules, permission
evaluation, competition state transitions, archive/file inspection, runner
request signing and CSV safety. Integration and security tests run against a
real PostgreSQL and exercise the HTTP route handlers (auth, visibility,
duplicate/concurrent submissions, team scoring, leaderboard freeze, score
recalculation, CSRF, authorization, flag confidentiality, score tampering,
cross-team privacy, upload safety, rate limiting).

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js app |
| `npm run worker` | background worker (jobs, clock, instance expiry) |
| `npm run runner` | challenge runner service |
| `npm run db:migrate` / `db:migrate:dev` / `db:seed` / `db:reset` | database |
| `npm test` / `test:report` / `test:e2e` | tests |
| `npm run typecheck` / `lint` / `audit:deps` | QA |
| `npm run challenges:build` | build vulnerable challenge images |

## Documentation

| Doc | Contents |
| --- | --- |
| `docs/ARCHITECTURE.md` | processes, data flow, key decisions, phase plan |
| `docs/DATABASE.md` | schema and model relationships |
| `docs/API.md` | REST API reference (`/api/v1`) |
| `docs/SECURITY.md` | threat model and hardening checklist |
| `docs/SANDBOX.md` | challenge execution isolation requirements |
| `docs/DEPLOYMENT.md` | cloud deployment, backup/recovery, scaling |
| `docs/ADMIN_GUIDE.md` | administrator & organizer walkthrough |
| `docs/LIMITATIONS.md` | known limitations & production-readiness assessment |

## License

UNLICENSED — internal/educational use. Contains intentionally vulnerable
software (`challenges/`) that must only run in the isolated runner.
