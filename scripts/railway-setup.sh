#!/usr/bin/env bash
# SINT Protocol — Railway Setup Script
#
# Provisions PostgreSQL + Redis on Railway and runs migrations.
#
# Prerequisites:
#   brew install railway
#   railway login
#
# Usage:
#   ./scripts/railway-setup.sh

set -euo pipefail

echo "🛡️  SINT Protocol — Railway Database Setup"
echo "============================================"
echo ""

# Check Railway CLI
if ! command -v railway &> /dev/null; then
  echo "❌ Railway CLI not found. Install: brew install railway"
  exit 1
fi

# Check login
if ! railway whoami &> /dev/null 2>&1; then
  echo "⚠️  Not logged in. Running: railway login"
  railway login
fi

echo "✅ Logged in as: $(railway whoami 2>/dev/null)"
echo ""

# Create project if not linked
if ! railway status &> /dev/null 2>&1; then
  echo "📦 Creating Railway project: sint-protocol"
  railway init
fi

echo ""
echo "🐘 Adding PostgreSQL..."
railway add --database postgres 2>/dev/null || echo "   (PostgreSQL may already exist)"

echo "🔴 Adding Redis..."
railway add --database redis 2>/dev/null || echo "   (Redis may already exist)"

echo ""
echo "📋 Fetching connection strings..."
DB_URL=$(railway variables --json 2>/dev/null | grep -o '"DATABASE_URL":"[^"]*"' | cut -d'"' -f4 || true)
REDIS_URL=$(railway variables --json 2>/dev/null | grep -o '"REDIS_URL":"[^"]*"' | cut -d'"' -f4 || true)

if [ -n "$DB_URL" ]; then
  echo "   DATABASE_URL: ${DB_URL:0:40}..."
else
  echo "   ⚠️  DATABASE_URL not found yet. Run: railway variables"
fi

if [ -n "$REDIS_URL" ]; then
  echo "   REDIS_URL: ${REDIS_URL:0:30}..."
else
  echo "   ⚠️  REDIS_URL not found yet. Run: railway variables"
fi

echo ""
echo "🏗️  Running migrations..."
if [ -n "$DB_URL" ]; then
  for migration in packages/persistence/migrations/*.sql; do
    echo "   → $(basename "$migration")"
    psql "$DB_URL" -f "$migration" 2>/dev/null || echo "   ⚠️  Migration may already be applied"
  done
  echo "   ✅ Migrations complete"
else
  echo "   ⏭️  Skipping (no DATABASE_URL yet)"
fi

echo ""
echo "============================================"
echo "✅ Railway setup complete!"
echo ""
echo "Next steps:"
echo "  1. Set env vars on your Railway service:"
echo "     railway variables --set SINT_STORE=postgres"
echo "     railway variables --set SINT_CACHE=redis"
echo "     railway variables --set SINT_API_KEY=your-secret-key"
echo ""
echo "  2. Deploy the gateway server:"
echo "     railway up"
echo ""
echo "  3. Or connect locally:"
echo "     export DATABASE_URL=\"$DB_URL\""
echo "     export REDIS_URL=\"$REDIS_URL\""
echo "     SINT_STORE=postgres SINT_CACHE=redis pnpm --filter @pshkv/gateway-server run dev"
echo ""
