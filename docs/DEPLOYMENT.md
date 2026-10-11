# CyberQuest CTF — Deployment Guide

## Topology

Four processes (see `docs/ARCHITECTURE.md`):

- **web** — Next.js standalone server (stateless; scale horizontally).
- **worker** — single-writer background jobs (achievements, notifications,
  competition clock, instance expiry). One replica is sufficient; it is safe to
  run several (jobs are claimed with `FOR UPDATE SKIP LOCKED`).
- **runner** — challenge execution, on a dedicated isolated host (see
  `docs/SANDBOX.md`). Optional.
- **PostgreSQL** and **Redis** — managed services recommended in production.

## Environment

Copy `.env.example`, set every secret from a secrets manager. Required:
`DATABASE_URL`, `SESSION_SECRET`, `FLAG_PEPPER`, `INSTANCE_FLAG_SECRET`,
`APP_URL` (https). Strongly recommended: `REDIS_URL` (shared rate limits +
leaderboard cache), `TRUST_PROXY=true` behind a trusted proxy. For execution
challenges: `RUNNER_URL` + `RUNNER_SHARED_SECRET` (and the runner's own vars).

Secrets must be stable: rotating `FLAG_PEPPER` invalidates all static flag
digests (rotate individual flags instead); rotating `SESSION_SECRET` invalidates
sessions and IP/invite hashes.

## Migrations

`prisma migrate deploy` is run by the `migrate` one-shot service in Compose, and
should be a release step in any platform (run once per deploy, before web/worker
start serving the new version). Never use `migrate dev`/`db push` in production.

## Container platforms

The multi-stage `Dockerfile` emits `runner` (web) and `worker` targets using
Next.js standalone output; `runner/Dockerfile` builds the challenge runner.
These run on any container platform (ECS/Fargate, Cloud Run, Kubernetes,
Fly.io, Render, …):

- Point a managed Postgres and Redis at the app via env vars.
- Run `migrate deploy` as a pre-deploy job.
- Deploy web (autoscaled, behind TLS), one+ worker, and — separately — the
  runner on an isolated node pool/VPC.
- Artifact storage: the default adapter writes to `STORAGE_DIR`. For multi-node
  web, use a shared volume or implement the `ArtifactStore` S3 adapter
  (interface in `src/server/storage/index.ts`). The content-addressed layout
  (`<key[0:2]>/<key[2:4]>/<key>`) maps directly to object keys.

### Kubernetes sketch

- Deployments: `web` (HPA on CPU), `worker` (1–N), `runner` (own node pool,
  taint/affinity, gVisor RuntimeClass).
- Jobs: `migrate` (pre-sync hook), optional `seed` for non-prod.
- Secrets via a Secret/ExternalSecrets; config via ConfigMap.
- NetworkPolicies: web/worker → db, redis, runner; runner → (nothing inbound
  except signed app traffic; deny egress).
- Probes: `GET /api/health` (readiness/liveness).

## Health & observability

- `GET /api/health` reports database and Redis status (200 healthy, 503
  degraded). Use for readiness/liveness and uptime checks.
- Admin → Overview shows users, submissions, security events, active instances,
  artifact storage, background-job backlog and runner status.
- Logs are structured to stdout; ship them to your platform's log aggregation.

## Backup & recovery

**PostgreSQL is the system of record.** Historical leaderboards reconstruct from
the `ScoreEvent`/`Solve` ledger, so point-in-time DB recovery restores
competitions exactly.

1. **Automated backups**: enable managed PITR, or schedule
   `pg_dump --format=custom` (e.g. hourly during events, daily otherwise);
   store encrypted off-site; test `pg_restore` regularly.
2. **Artifacts**: the content-addressed store is immutable; back up
   `STORAGE_DIR` (or rely on versioned/replicated object storage). Lost
   artifacts can be regenerated for the built-in challenges via
   `challenges/generate-artifacts.ts`.
3. **Redis** is a cache only — no backup required; it rebuilds on demand.
4. **Recovery drill**: restore DB → restore/point at artifact store → run
   `prisma migrate deploy` → start web/worker → verify `/api/health` and that a
   known competition's leaderboard matches. Document RPO/RTO for your event.

## Scaling for a live event

- Pre-scale `web` replicas; ensure Redis is provisioned (rate limits + cache).
- The leaderboard is cached briefly and invalidated on scoring; it also serves
  from a frozen snapshot after `freezeAt`.
- Pre-provision runner capacity (`RUNNER_MAX_INSTANCES`) and per-subject quotas
  (admin settings) for the expected concurrency.

## Release checklist

Work through `docs/SECURITY.md` §8, confirm CI is green (typecheck, lint, tests,
build, audit, image scan), run `migrate deploy`, verify `/api/health`, rotate
seed credentials, and (if used) confirm the runner's isolation report.
