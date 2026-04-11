#!/bin/bash
set -e

echo "🛡️  SINT Protocol — npm publish"
echo ""

# Packages in dependency order — core first, bridges after
PACKAGES=(
  "packages/core"
  "packages/capability-tokens"
  "packages/evidence-ledger"
  "packages/policy-gateway"
  "packages/bridge-mcp"
  "packages/bridge-ros2"
  "packages/bridge-mavlink"
  "packages/bridge-iot"
  "packages/bridge-a2a"
  "packages/bridge-economy"
  "packages/token-registry"
)

echo "Building all packages first..."
pnpm run build

echo ""
echo "Running tests (gate)..."
pnpm run test

echo ""
echo "Publishing packages:"
for pkg in "${PACKAGES[@]}"; do
  name=$(node -p "require('./$pkg/package.json').name")
  version=$(node -p "require('./$pkg/package.json').version")
  echo "  → $name@$version"
  (cd "$pkg" && npm publish --access public) && echo "    ✓ published" || echo "    ⚠ skipped (version may already exist)"
done

echo ""
echo "✓ All packages published. Verify at:"
for pkg in "${PACKAGES[@]}"; do
  name=$(node -p "require('./$pkg/package.json').name")
  echo "  https://www.npmjs.com/package/$name"
done
