# CyberQuest CTF — REST API (`/api/v1`)

Same-origin JSON API consumed by the web UI. Server components call the service
layer directly; interactive clients use these endpoints. Every endpoint goes
through one wrapper (`src/server/http/api.ts`) that enforces session resolution,
Origin/CSRF checks, Zod validation, rate limiting and a uniform envelope.

## Conventions

- **Auth**: cookie session (`__Host-cq_session` in production). No bearer
  tokens. Authorization is always enforced server-side per resource.
- **CSRF**: unsafe methods require a same-origin `Origin` (or `Sec-Fetch-Site`).
  Bodies must be `application/json` (uploads use `multipart/form-data`).
- **Success**: `{ "ok": true, "data": <T>, "meta"?: {...} }`.
- **Error**: `{ "ok": false, "error": { "code": <CODE>, "message": <string>, "details"?: [...] } }`
  with HTTP status from the code: `BAD_REQUEST` 400, `UNAUTHENTICATED` 401,
  `FORBIDDEN` 403, `NOT_FOUND` 404, `CONFLICT` 409, `PAYLOAD_TOO_LARGE` 413,
  `VALIDATION_FAILED` 422, `RATE_LIMITED` 429 (+`Retry-After`), `UNAVAILABLE`
  503, `INTERNAL` 500.
- **Pagination**: list endpoints use `page`/`pageSize` or `cursor`/`take`.
- Unpublished/forbidden resources return **404** (not 403) to prevent
  enumeration.

## Authentication

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/auth/register` | self-registration (role forced to PARTICIPANT); rate-limited |
| POST | `/auth/login` | sets session cookie; rate-limited per IP + account; lockout |
| POST | `/auth/logout` | clears session |
| GET | `/auth/session` | current user or `null` |
| PATCH | `/auth/profile` | display name, institution |
| POST | `/auth/password` | change password (revokes other sessions) |

## Competitions

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/competitions` | public (visible set; `?includeDrafts=true` for staff) |
| POST | `/competitions` | `competition.create` |
| GET | `/competitions/{id}` | visible to viewer (drafts: staff only) |
| PATCH | `/competitions/{id}` | `competition.configure` |
| POST | `/competitions/{id}/status` | `competition.configure` (lifecycle transition) |
| GET | `/competitions/{id}/publication-check` | `competition.configure` |
| POST | `/competitions/{id}/invite-code` | `competition.configure` |
| POST\|DELETE | `/competitions/{id}/register` | participant (register / withdraw) |
| GET | `/competitions/{id}/registrations` | `participants.manage` |
| PATCH | `/competitions/{id}/registrations/{regId}` | approve/reject |
| GET\|POST | `/competitions/{id}/staff` · DELETE `/staff/{staffId}` | `competition.staff.manage` |
| GET\|POST | `/competitions/{id}/announcements` · DELETE `/announcements/{annId}` | `announcement.manage` |
| GET | `/competitions/{id}/leaderboard` | public (`?view=public` forces public projection) |
| GET | `/competitions/{id}/analytics` | `analytics.view` |
| GET | `/competitions/{id}/export/{standings\|submissions\|score-events\|challenges}` | `reports.export` (CSV) |

## Challenges — participant play (competition-scoped)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/competitions/{id}/challenges` | visible list (no flags/staff fields) |
| GET | `/competitions/{id}/challenges/{challengeId}` | full view; 404 if locked/unpublished for viewer |
| POST | `/competitions/{id}/challenges/{challengeId}/submit` | submit flag → `{status, pointsAwarded?, firstBlood?, …}` |
| POST | `/competitions/{id}/challenges/{challengeId}/writeup` | manual-grade submission |
| POST | `/competitions/{id}/challenges/{challengeId}/hints/{hintId}/unlock` | unlock hint (idempotent) |
| POST | `/competitions/{id}/challenges/{challengeId}/instance` | start isolated instance |
| POST\|DELETE | `…/instance/{instanceId}/reset` · `…/instance/{instanceId}` | reset / stop |

## Challenges — authoring (`challenge.manage`, by challenge id)

| Method | Path |
| --- | --- |
| GET\|PATCH\|DELETE | `/challenges/{id}` |
| POST | `/challenges/{id}/status` (DRAFT→IN_REVIEW→APPROVED→PUBLISHED→ARCHIVED/RETIRED) |
| POST | `/challenges/{id}/clone` |
| POST | `/challenges/{id}/flags` · PATCH `/flags/{flagId}` (rotate / activate) · POST `/flags/test` |
| POST | `/challenges/{id}/hints` · PATCH\|DELETE `/hints/{hintId}` |
| POST | `/challenges/{id}/artifacts` (multipart) |
| POST | `/challenges/{id}/reviews` (`challenge.review`) |
| GET | `/challenges/{id}/versions` |

Flag endpoints never return digests or plaintext.

## Submissions, teams, artifacts, me

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/competitions/{id}/submissions` | `submission.view_all` (anti-cheat; no flag values) |
| GET | `/competitions/{id}/grading` · POST `/submissions/{id}/grade` | `submission.grade` |
| GET\|POST | `/competitions/{id}/teams` · POST `/teams/join` | participant |
| PATCH | `/competitions/{id}/teams/{teamId}` | hide/unhide (`participants.manage`) |
| DELETE | `/competitions/{id}/teams/{teamId}/members/{userId}` | captain or organizer |
| GET | `/competitions/{id}/team` · POST `/team/{leave,captain,invite-code}` | own team |
| GET | `/competitions/{id}/instances` · DELETE `/instances/{id}` | staff view / admin terminate |
| GET\|POST | `/competitions/{id}/scores/adjust`,`/recalculate` · GET `/scores/{subjectKey}` | `score.adjust` / own ledger |
| GET\|PATCH\|DELETE | `/artifacts/{id}` · GET `/artifacts/{id}/download` | authorized download (attachment, sandboxed) |
| GET | `/me/submissions` · `/me/progress` | own history / gamification |
| GET\|POST | `/notifications` · `/notifications/read` | own notifications |
| GET | `/categories` | public |

## Administration (platform permissions)

| Method | Path | Permission |
| --- | --- | --- |
| GET\|POST | `/admin/users` · PATCH `/admin/users/{id}` | `platform.users.manage` |
| GET\|POST | `/admin/institutions` · PATCH `/admin/institutions/{id}` | `platform.institutions.manage` |
| GET\|POST | `/admin/environments` · PATCH `/admin/environments/{id}` | `platform.environments.manage` |
| GET\|POST | `/admin/achievements` · PATCH `/admin/achievements/{id}` | `platform.achievements.manage` |
| GET\|PATCH | `/admin/settings` | `platform.settings.manage` |
| GET | `/admin/overview` · `/admin/runner` | `platform.audit.view` / `platform.environments.manage` |
| GET | `/admin/audit` · `/admin/export/audit` | `platform.audit.view` / `platform.reports.export` |
| GET | `/admin/security` · POST `/admin/security/{id}/ack` | `platform.security.view` |

## Health

`GET /api/health` → `{ status: "ok"|"degraded", checks: { database, redis } }`,
200 or 503. Unauthenticated; for probes and uptime checks.

> This reference is intentionally concise. Request/response shapes are defined by
> the Zod schemas in each route and the service layer (`src/server/services`),
> which are the authoritative contract; a separate API service would publish
> OpenAPI, but here the UI and API share one typed codebase.
