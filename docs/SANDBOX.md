# CyberQuest CTF — Secure Challenge Execution

The main application **never executes challenge code**. Execution-based
challenges (e.g. the vulnerable web apps) run only through the separate
**runner** service, which is the sole component allowed to talk to a container
engine. This document states what must be true before you enable execution.

## Honest default: execution disabled

Out of the box `RUNNER_BACKEND=disabled`. In this mode:

- The runner refuses to start any container and reports `backend: disabled` in
  its health/isolation report.
- The app shows execution challenges but returns a clear "execution is not
  available on this deployment; use the offline artifacts" message when a
  participant tries to start an instance.
- Offline challenges (crypto, reverse, forensics) are fully functional.

We do **not** claim isolation that is not configured. Enable the Docker backend
only after the controls below are in place and tested.

## Runner interface

`src/server/runner/` defines a pluggable backend interface and an HMAC-signed
client. `runner/src/` implements the service with two backends:

- `DisabledBackend` — the safe default above.
- `DockerBackend` — hardened containers (below). Swap in a stronger backend
  (gVisor/Kata/Firecracker, or a remote orchestrator) by implementing the same
  interface; the app and protocol are unchanged.

## Request authentication

Every app→runner request is signed:
`HMAC-SHA256(RUNNER_SHARED_SECRET, timestamp \n nonce \n METHOD \n path \n sha256(body))`.
The runner rejects stale timestamps (>60s skew), malformed or replayed nonces,
and bad signatures. Put the runner on a private network regardless.

## Docker backend controls (per instance)

Implemented in `runner/src/docker-backend.ts` and asserted by the live test
`tests/runner/docker-backend.test.ts`:

- **Dedicated per-instance bridge network** with inter-container communication
  (`enable_icc=false`) and masquerade/SNAT (`enable_ip_masquerade=false`)
  disabled → no routed egress and no lateral movement between instances. The
  host still reaches the instance via the published port's DNAT.
- `--cap-drop ALL`, `--security-opt no-new-privileges`, `--read-only` root
  filesystem, non-root user (image default or `65534`).
- `--memory` / `--memory-swap` (equal, no swap), `--cpus`, `--pids-limit`,
  `--ulimit nofile/nproc`, and a size-limited `noexec,nosuid` tmpfs for scratch.
- **No bind mounts, no Docker socket, no host networking.**
- Image allow-list (`RUNNER_ALLOWED_IMAGES`, e.g. `cyberquest/chal-`): the
  runner refuses any other image.
- Per-instance TTL enforced by the runner's reaper and the app worker
  (`instances.expire`); reset and terminate supported; lifecycle events logged
  to `ChallengeInstanceEvent`.
- A global `RUNNER_MAX_INSTANCES` quota prevents resource exhaustion.

The live test confirms: the SQLi image starts, serves the per-instance flag
only via the exploit (never on the landing page), runs as uid 65534, cannot
reach an external host, and is fully removed (container + network) on destroy.

## Required before enabling in production

1. **Dedicated host / VPC** for the runner, isolated from the app, database,
   Redis, secrets and internal services. Mounting the Docker socket grants
   root-equivalent access to that host — so that host must contain nothing else
   of value, and egress from it must be restricted at the network layer too
   (the masquerade-disabled bridge is defence-in-depth, not the only control).
2. **Stronger runtime** for public/untrusted events: set
   `RUNNER_DOCKER_RUNTIME=runsc` (gVisor) or run Kata/Firecracker microVMs. The
   plain `runc` default shares the host kernel.
3. **Reviewed images only.** Build challenge images from audited sources
   (`challenges/`), scan them, and enable them as execution environments in the
   admin UI one by one. New environments are created disabled.
4. **Deny-by-default egress** at the firewall/VPC level in addition to the
   masquerade-disabled bridge.
5. **Monitoring** of instance count, resource usage and `INSTANCE_FAILURE`
   security events.

## What is explicitly NOT supported

- Executing untrusted/participant-supplied binaries on the app server.
- Arbitrary host commands, unrestricted shell access, or privileged containers.
- Participant-chosen targets or outbound scanning. Each instance is reachable
  only at the address shown to its owner; challenges attack only the targets
  they provide.
