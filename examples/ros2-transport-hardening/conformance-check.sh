#!/usr/bin/env bash
# Conformance check for transport-level non-bypass hardening.
#
# Orchestration (run from this directory):
#   1. Build and start all services via docker compose.
#   2. Wait for the guarded_talker to log "[guarded_talker] OK".
#   3. Read the attacker container's exit code.
#
# Pass criteria:
#   - guarded_talker logged OK (policy + transport round-trip worked)
#   - attacker exit code ∈ {2, 3}
#     (blocked at either subscriber-match or participant-creation stage)
#
# Fail criteria:
#   - attacker exit code == 0  (bypass succeeded — regression)
#   - guarded_talker never reached OK (demo itself is broken)

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${HERE}"

COMPOSE=(docker compose -f docker-compose.yml)

cleanup() {
  "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[conformance] building images"
"${COMPOSE[@]}" build

echo "[conformance] starting infra + guarded services"
"${COMPOSE[@]}" up -d postgres redis gateway keystore-init
"${COMPOSE[@]}" up -d guarded-talker

echo "[conformance] waiting for guarded_talker OK sentinel"
deadline=$(( SECONDS + 90 ))
while (( SECONDS < deadline )); do
  if "${COMPOSE[@]}" logs guarded-talker 2>/dev/null | grep -q "\[guarded_talker\] OK"; then
    echo "[conformance] guarded_talker reached OK"
    break
  fi
  sleep 2
done

if ! "${COMPOSE[@]}" logs guarded-talker 2>/dev/null | grep -q "\[guarded_talker\] OK"; then
  echo "[conformance] FAIL: guarded_talker never logged OK" >&2
  "${COMPOSE[@]}" logs guarded-talker
  exit 1
fi

echo "[conformance] running attacker (expect blocked)"
set +e
"${COMPOSE[@]}" run --rm attacker
attacker_exit=$?
set -e

echo "[conformance] attacker exit code: ${attacker_exit}"

case "${attacker_exit}" in
  2|3)
    echo "[conformance] PASS: attacker blocked at transport (exit ${attacker_exit})"
    exit 0
    ;;
  0)
    echo "[conformance] FAIL: attacker bypass succeeded" >&2
    exit 1
    ;;
  *)
    echo "[conformance] FAIL: unexpected attacker exit ${attacker_exit}" >&2
    exit 1
    ;;
esac
