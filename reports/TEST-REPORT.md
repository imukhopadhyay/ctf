# CyberQuest CTF — Test Execution Report

Generated: 2026-10-11T17:06:37.169Z

## Summary

| Result | Count |
| --- | --- |
| ✅ Passed | 155 |
| ❌ Failed | 0 |
| ⏭️ Skipped | 0 |
| 📝 Todo / not implemented | 0 |
| **Total** | **155** |

All executed tests passed.

> Skipped suites are integration tests gated on external infrastructure (e.g. the live Docker runner tests run only with `RUN_DOCKER_TESTS=1`). They are reported here as skipped, never as passed.

## Integration

### `tests/integration/lifecycle.test.ts`

- ✅ authentication registers, logs in with username or email, and validates the session
- ✅ authentication rejects weak passwords and duplicate accounts with generic errors
- ✅ authentication locks the account after repeated failures and records security events
- ✅ authentication does not reveal whether an account exists
- ✅ authentication suspended users lose their sessions
- ✅ competition lifecycle admin creates a competition, assigns staff, validates and publishes it
- ✅ competition lifecycle participants and unassigned organizers cannot create or configure competitions they do not own
- ✅ competition lifecycle worker clock activates and completes competitions on schedule
- ✅ competition lifecycle supports public, private (approval) and invitation registration
- ✅ challenge authoring and visibility organizer creates, tests and publishes; participants only see published challenges
- ✅ challenge authoring and visibility versions every edit and rotation invalidates old flags
- ✅ challenge authoring and visibility prerequisites lock challenges until solved and release schedules hide future challenges
- ✅ challenge authoring and visibility evaluators review challenges and grade manual write-ups
- ✅ teams creates a team, joins by invitation code, enforces size and uniqueness
- ✅ teams concurrent joins cannot exceed the team size limit
- ✅ teams locks membership changes while running unless allowed, and transfers captaincy on leave
- ✅ teams users must be registered before joining

### `tests/integration/submissions.test.ts`

- ✅ flag submission accepts a correct flag, awards points once, and records an auditable score event
- ✅ flag submission rejects incorrect flags without revealing the answer and stores no plaintext
- ✅ flag submission honours case-insensitive and whitespace-normalized configuration
- ✅ flag submission enforces attempt limits
- ✅ flag submission applies incorrect-submission penalties when enabled
- ✅ flag submission reports unavailable when the competition is paused or the challenge closed
- ✅ flag submission rate limits rapid submissions per user and challenge
- ✅ flag submission dynamic scoring decays for later solvers and first blood goes only to the first
- ✅ concurrency parallel correct submissions from the same team score exactly once
- ✅ concurrency parallel solves by different subjects get exactly one first blood and correct dynamic values
- ✅ concurrency parallel incorrect submissions cannot exceed the attempt limit
- ✅ team scoring requires team membership in team mode and aggregates member solves
- ✅ hints charges the configured penalty once and is idempotent
- ✅ hints enforces ordering and attempt-based unlock conditions
- ✅ hints does not charge when hint penalties are disabled
- ✅ hints net score reflects solve minus hint penalty
- ✅ leaderboard & score administration freezes public standings but staff see live data
- ✅ leaderboard & score administration anonymizes other competitors when configured
- ✅ leaderboard & score administration manual adjustments are audited and explained
- ✅ leaderboard & score administration participants cannot adjust scores or view another subject's ledger
- ✅ leaderboard & score administration recalculation reconciles after an organizer changes point values, and is idempotent
- ✅ worker awards achievements and first-blood notifications after a solve

## Runner (live)

### `tests/runner/docker-backend.test.ts`

- ✅ DockerBackend (live) refuses images outside the allow-list
- ✅ DockerBackend (live) starts an isolated container and serves the per-instance flag only via the exploit
- ✅ DockerBackend (live) runs non-root with no network egress
- ✅ DockerBackend (live) destroys the container and its network

## Unit

### `tests/unit/achievements-signing-csv.test.ts`

- ✅ achievement rules first blood
- ✅ achievement rules category specialist
- ✅ achievement rules all-rounder progress
- ✅ achievement rules consistency streak counts consecutive UTC days
- ✅ achievement rules hintless solves
- ✅ achievement rules team collaboration counts distinct solvers
- ✅ achievement rules rejects malformed admin criteria
- ✅ runner request signing verifies a valid signature once and rejects replays
- ✅ runner request signing rejects tampered body, path, method, secret and stale timestamps
- ✅ CSV export neutralizes spreadsheet formulas
- ✅ CSV export quotes commas and newlines

### `tests/unit/archive-and-files.test.ts`

- ✅ archive path safety rejects "../etc/passwd"
- ✅ archive path safety rejects "a/../../b"
- ✅ archive path safety rejects "/abs/path"
- ✅ archive path safety rejects "C:/windows/x"
- ✅ archive path safety rejects "dir\\..\\x"
- ✅ archive path safety rejects "ok\u0000.txt"
- ✅ archive path safety allows normal nested paths
- ✅ inspectZip accepts a benign archive and lists entries
- ✅ inspectZip rejects traversal (zip-slip)
- ✅ inspectZip rejects symlinks
- ✅ inspectZip rejects decompression bombs by ratio and total size
- ✅ inspectZip rejects too many entries
- ✅ inspectZip rejects garbage
- ✅ inspectZip flags duplicate entries
- ✅ file type detection detects common evidence formats by magic bytes
- ✅ file type detection blocks unsafe ZIP uploads during inspection
- ✅ file type detection extracts ELF metadata from a real binary
- ✅ filename sanitization "../../etc/passwd" -> "passwd"
- ✅ filename sanitization "C:\\Windows\\evil.exe" -> "evil.exe"
- ✅ filename sanitization "a\"b<c>.txt" -> "abc.txt"
- ✅ filename sanitization ".." -> "artifact.bin"
- ✅ filename sanitization ".bashrc" -> "bashrc"
- ✅ filename sanitization "con.txt" -> "_con.txt"
- ✅ filename sanitization "name\r\nX-Injected: 1" -> "nameX-Injected 1"
- ✅ filename sanitization produces header-safe Content-Disposition

### `tests/unit/competition-state.test.ts`

- ✅ competition transitions DRAFT -> SCHEDULED = true
- ✅ competition transitions DRAFT -> ACTIVE = false
- ✅ competition transitions SCHEDULED -> ACTIVE = true
- ✅ competition transitions ACTIVE -> PAUSED = true
- ✅ competition transitions PAUSED -> ACTIVE = true
- ✅ competition transitions ACTIVE -> COMPLETED = true
- ✅ competition transitions COMPLETED -> ARCHIVED = true
- ✅ competition transitions ARCHIVED -> ACTIVE = false
- ✅ competition transitions ACTIVE -> DRAFT = false
- ✅ validateCompetitionConfig accepts a valid configuration
- ✅ validateCompetitionConfig reports each problem
- ✅ validateCompetitionConfig requires an end time except for practice arenas
- ✅ validateCompetitionConfig requires freeze inside the competition window
- ✅ time-based rules accepts submissions only while ACTIVE and inside the window
- ✅ time-based rules clock moves SCHEDULED to ACTIVE to COMPLETED
- ✅ time-based rules registration window

### `tests/unit/flag-match.test.ts`

- ✅ normalizeFlag always trims surrounding whitespace
- ✅ normalizeFlag collapses internal whitespace only when configured
- ✅ normalizeFlag lower-cases only when case-insensitive
- ✅ normalizeFlag applies Unicode NFC so composed and decomposed forms match
- ✅ matchStaticFlag accepts an exact match
- ✅ matchStaticFlag rejects wrong case for case-sensitive flags
- ✅ matchStaticFlag accepts wrong case for case-insensitive flags
- ✅ matchStaticFlag supports multiple accepted flags (multi-stage)
- ✅ matchStaticFlag ignores inactive and expired flags
- ✅ matchStaticFlag binds the digest to the key version (rotation invalidates old digests)
- ✅ matchStaticFlag digests depend on the pepper
- ✅ matchStaticFlag digestsEqual rejects malformed input
- ✅ instance flags are deterministic and bound to instance, challenge and subject
- ✅ instance flags verify in constant time and tolerate surrounding whitespace
- ✅ submissionFingerprint is short, keyed and normalization-insensitive

### `tests/unit/permissions.test.ts`

- ✅ platform permissions admins hold every platform permission
- ✅ platform permissions participants hold none
- ✅ platform permissions organizers can only create competitions at platform level
- ✅ platform permissions evaluators cannot create competitions
- ✅ competition permissions admins hold everything regardless of assignment
- ✅ competition permissions unassigned organizers hold nothing on other competitions
- ✅ competition permissions evaluator assignment grants review/grading but not configuration
- ✅ competition permissions a participant account cannot act as staff even if assigned
- ✅ competition permissions assignable roles follow global role

### `tests/unit/scoring.test.ts`

- ✅ dynamicValue gives the first solver the full value
- ✅ dynamicValue decays monotonically and reaches the minimum at `decay` prior solves
- ✅ dynamicValue matches the quadratic formula
- ✅ dynamicValue handles degenerate configuration
- ✅ dynamicValue static model ignores solve count
- ✅ computeStandings sums the ledger including penalties and adjustments
- ✅ computeStandings breaks ties by earliest last solve
- ✅ computeStandings breaks ties by fewest submissions when configured
- ✅ computeStandings excludes hidden subjects unless requested
- ✅ computeStandings respects the freeze cutoff
- ✅ computeStandings gives identical rank to fully tied subjects
- ✅ computeStandings aggregates team scores from multiple members' events
- ✅ scoreProgression produces cumulative series per subject
- ✅ levelForXp maps XP to levels
- ✅ formatters formatDateTime combines timezone name without throwing (regression)
- ✅ formatters formatBytes

## Security

### `tests/security/api-security.test.ts`

- ✅ administrative endpoints require authentication (401) and the right role (403)
- ✅ administrative endpoints participants cannot change competition state or list teams/submissions
- ✅ administrative endpoints rejects unknown settings keys (mass assignment)
- ✅ CSRF protection rejects state-changing requests from foreign or missing origins
- ✅ CSRF protection requires JSON content type (blocks simple cross-site form posts)
- ✅ flag confidentiality participant-facing responses never contain flags, digests or staff-only fields
- ✅ flag confidentiality even staff APIs never return stored flag digests
- ✅ flag confidentiality participants cannot read the staff challenge endpoint
- ✅ flag confidentiality unpublished challenges are 404 for participants (no enumeration) and cannot be submitted to
- ✅ score manipulation ignores client-supplied points/scores in submissions
- ✅ score manipulation participants cannot call the adjustment endpoint
- ✅ score manipulation replaying a correct submission does not re-award points
- ✅ cross-team privacy a participant cannot read another team's score ledger or submissions
- ✅ cross-team privacy public leaderboard does not expose team invite codes or member emails
- ✅ artifact access control and upload safety downloads are forced attachments with nosniff and sandbox CSP; only for visible, published challenges
- ✅ artifact access control and upload safety rejects malicious archives and oversized uploads, and participants cannot upload
- ✅ authentication & session security sets an httpOnly SameSite session cookie and never returns the password hash
- ✅ authentication & session security rejects forged and malformed session tokens
- ✅ authentication & session security rate limits login attempts per IP
- ✅ authentication & session security returns a uniform validation envelope for bad input
