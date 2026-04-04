#!/bin/bash
# Publish @sint/mcp-scanner to npm.
# Prerequisites: npm login (as sint-ai org or personal account with access to @sint scope)
#
# Usage:
#   bash scripts/publish-scanner.sh          # publish to npm
#   bash scripts/publish-scanner.sh --dry-run  # preview what would be published
set -e

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCANNER_DIR="$REPO_ROOT/apps/sint-mcp-scanner"
DRY_RUN=""

if [[ "$1" == "--dry-run" ]]; then
  DRY_RUN="--dry-run"
  echo "--- DRY RUN MODE ---"
fi

echo "Building @sint/mcp-scanner..."
cd "$REPO_ROOT"
pnpm --filter @sint/mcp-scanner build

echo "Verifying CLI works..."
node "$SCANNER_DIR/dist/cli.js" --server test --tools '[{"name":"readFile","description":"reads a file"}]' > /dev/null
echo "CLI OK"

echo "Publishing..."
cd "$SCANNER_DIR"
npm publish --access public $DRY_RUN

if [[ -z "$DRY_RUN" ]]; then
  echo ""
  echo "Published! Verify with:"
  echo "  npx @sint/mcp-scanner --server myserver --tools '[{\"name\":\"bash\",\"description\":\"runs shell\"}]'"
  echo "  npx sint-scan --help"
fi
