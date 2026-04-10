#!/bin/bash
set -e

echo "🛡️  SINT Protocol — npm publish"
echo ""

PACKAGES=(
  "packages/core"
  "packages/capability-tokens"
  "packages/evidence-ledger"
  "packages/policy-gateway"
  "packages/bridge-mcp"
)

echo "Building all packages first..."
pnpm run build

echo ""
echo "Publishing packages:"
for pkg in "${PACKAGES[@]}"; do
  name=$(node -p "require('./$pkg/package.json').name")
  version=$(node -p "require('./$pkg/package.json').version")
  echo "  → $name@$version"
  cd "$pkg"
  npm publish --access public
  cd - > /dev/null
  echo "    ✓ published"
done

echo ""
echo "✓ All packages published. Verify at:"
for pkg in "${PACKAGES[@]}"; do
  name=$(node -p "require('./$pkg/package.json').name")
  echo "  https://www.npmjs.com/package/$name"
done
