#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROFILE="${1:-dev}"

case "$PROFILE" in
  dev|edge|prod-lite) ;;
  *)
    echo "Usage: $0 [dev|edge|prod-lite]" >&2
    exit 1
    ;;
esac

COMPOSE_FILE="$ROOT_DIR/docker/compose/${PROFILE}.yml"

echo "[SINT] Starting ${PROFILE} stack using ${COMPOSE_FILE}"
docker compose -f "$COMPOSE_FILE" up --build -d
echo "[SINT] Stack started. Check health:"
echo "  docker compose -f $COMPOSE_FILE ps"
