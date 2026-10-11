#!/usr/bin/env bash
# Builds the intentionally vulnerable challenge images. Requires a Docker daemon.
# These images must only be run by the isolated runner, never on the app host.
set -euo pipefail
cd "$(dirname "$0")"
echo "Building cyberquest/chal-sqli-login:1.0"
docker build -t cyberquest/chal-sqli-login:1.0 web/sqli-login
echo "Building cyberquest/chal-idor-notes:1.0"
docker build -t cyberquest/chal-idor-notes:1.0 web/idor-notes
echo "Done. Allow-list prefix 'cyberquest/chal-' in RUNNER_ALLOWED_IMAGES and register the environments in platform settings."
