# CyberQuest CTF — Administrator & Organizer Guide

## Roles

- **Platform Administrator** — manages users, institutions, execution
  environments, achievements, platform settings; views audit and security logs;
  can do anything an organizer can on any competition.
- **Competition Organizer** — creates and runs competitions they are assigned
  to: challenges, flags, hints, artifacts, participants/teams, announcements,
  scoring, lifecycle, exports.
- **Faculty / Evaluator** — reviews challenge quality, grades manual write-ups,
  views analytics for assigned competitions.
- **Participant** — registers, forms/joins teams, solves challenges.

Capabilities are fixed in code; roles are assigned in the database. A privileged
role cannot be minted through the UI.

## Administrator setup

1. Sign in with the seeded admin (password = `SEED_ADMIN_PASSWORD`). **Change
   it immediately** under Profile → Change password.
2. **Platform settings** (`/admin/settings`): toggle self-registration, set a
   maintenance banner, enable practice arenas and the daily challenge, set the
   per-subject instance quota, and require review-before-publish if desired.
3. **Institutions**: add the colleges/organisations participants select.
4. **Organizer accounts**: `/admin/users` → "Create account" (role ORGANIZER),
   or promote an existing user. Share the initial password securely; they
   change it on first login.
5. **Execution environments** (only for execution-based challenges): add the
   approved image (must match `RUNNER_ALLOWED_IMAGES`) with its port and limits.
   New environments are **disabled**; enable one only after reviewing the image
   and confirming the runner's isolation (`docs/SANDBOX.md`). The admin overview
   shows runner health.
6. **Monitoring**: `/admin/overview` (health, storage, jobs, runner),
   `/admin/security` (rate limits, lockouts, access denials, suspected flag
   sharing — acknowledge events), `/admin/audit` (every admin/scoring action;
   exportable).

## Running a competition (organizer)

1. **Create** (`/organizer` → New competition). It starts as a **draft**.
2. **Configure** everything on the Settings tab: schedule + timezone, individual
   vs team (and sizes), access mode (public / approval / invitation code),
   scoring model (static or dynamic), tie-break, hint/wrong-answer penalties,
   default attempt limit, leaderboard freeze, identity display, solution
   disclosure policy, rules/permitted tools/prohibited activities.
3. **Add challenges** (Challenges tab → New challenge):
   - Write a Markdown description and learning objectives; set category,
     difficulty, points (and dynamic min/decay), tags/skills.
   - **Flags tab**: add one or more flags. Static flags are write-only (stored
     hashed); use the **flag tester** to confirm a candidate matches — a
     challenge cannot be published until its static flags are tested. For
     instance-based challenges, add a per-instance flag (derived automatically)
     and choose the execution environment.
   - **Hints tab**: add ordered hints with costs and unlock conditions.
   - **Artifacts tab**: upload downloadable files (inspected and stored by
     SHA-256). Mark answer keys "hidden" so only staff can fetch them.
   - **Preview as participant** to see exactly what players see.
   - Move the challenge through DRAFT → (review) → PUBLISHED.
4. **Validate & publish**: the overview shows a publication checklist. Publish
   when it passes (≥1 published challenge, rules present, end time set, etc.),
   then move the competition DRAFT → SCHEDULED → ACTIVE (or let the clock do it
   at the start time).
5. **During the event**:
   - Approve registrations (private competitions) on Participants.
   - Post announcements (participants are notified).
   - Grade write-ups on Grading (manual challenges).
   - Watch Instances for execution challenges; terminate stuck ones.
   - Resolve disputes with **manual score adjustments** (reason required, fully
     audited) or **recalculation** (preview, then apply) on Scores.
   - Hide/disqualify a team from Participants if rules are broken.
6. **Freeze & finish**: set a leaderboard freeze near the end for suspense;
   the public board stops updating while staff see live standings. Move to
   COMPLETED (or let the clock). Solutions disclose per your policy.
7. **Report**: export standings, submissions, score events and challenges as
   CSV (spreadsheet-formula-safe); use the browser's print for printable views.

## Evaluator workflow

`/evaluator` lists your assigned competitions with pending reviews and grading.
Review challenges (quality + educational ratings; approving one in review marks
it APPROVED) and grade write-ups (accept with points, or reject with feedback —
participants are notified).

## Good practice

- Keep flags unique per challenge; rotate (don't reuse) if leaked.
- Prefer per-instance flags for exploitation challenges so a leaked flag is
  useless to other teams (and sharing is detected).
- Test every challenge end to end (preview, flag tester, and — for instances —
  start one) before publishing.
- Treat all uploaded artifacts as untrusted; they are synthetic by policy.
