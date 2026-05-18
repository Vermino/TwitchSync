#!/usr/bin/env bash
# TwitchSync — generate-env.sh
# Creates a .env file from .env.example with auto-generated secrets.
# Usage: ./scripts/generate-env.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$ROOT_DIR/.env"

if [ -f "$ENV_FILE" ]; then
  echo "⚠️  .env already exists. Delete it first if you want to regenerate."
  exit 0
fi

echo "🔧 Generating .env from .env.example..."
cp "$ROOT_DIR/.env.example" "$ENV_FILE"

# Generate secrets
JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 32)
DB_PASSWORD=$(openssl rand -hex 16 2>/dev/null || head -c 16 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 16)

# Substitute placeholders
sed -i.bak "s|CHANGE_ME_TO_A_RANDOM_SECRET_AT_LEAST_32_CHARS|${JWT_SECRET}|g" "$ENV_FILE"
sed -i.bak "s|changeme_use_a_strong_password|${DB_PASSWORD}|g" "$ENV_FILE"
rm -f "$ENV_FILE.bak"

echo ""
echo "📋 Enter your details:"

read -rp "  Server IP or hostname (e.g. 192.168.1.100 or twitchsync.example.com): " SERVER_HOST
read -rp "  Use HTTPS? [y/N]: " USE_HTTPS
SCHEME="http"
if [[ "$USE_HTTPS" =~ ^[Yy]$ ]]; then SCHEME="https"; fi
read -rp "  Frontend port [2261]: " FPORT
FPORT="${FPORT:-2261}"

if [[ "$FPORT" == "80" || "$FPORT" == "443" ]]; then
  PUBLIC_URL="${SCHEME}://${SERVER_HOST}"
else
  PUBLIC_URL="${SCHEME}://${SERVER_HOST}:${FPORT}"
fi

read -rp "  Twitch Client ID: " TWITCH_CLIENT_ID
read -rsp "  Twitch Client Secret: " TWITCH_CLIENT_SECRET
echo ""

# Write values
sed -i.bak "s|http://YOUR_SERVER_IP:2261|${PUBLIC_URL}|g" "$ENV_FILE"
sed -i.bak "s|your_twitch_client_id|${TWITCH_CLIENT_ID}|g" "$ENV_FILE"
sed -i.bak "s|your_twitch_client_secret|${TWITCH_CLIENT_SECRET}|g" "$ENV_FILE"
sed -i.bak "s|FRONTEND_PORT=2261|FRONTEND_PORT=${FPORT}|g" "$ENV_FILE"
rm -f "$ENV_FILE.bak"

echo ""
echo "✅ .env created!"
echo ""
echo "📌 Add this exact URL to your Twitch app's OAuth Redirect URLs:"
echo "   ${PUBLIC_URL}/auth/twitch/callback"
echo ""
echo "🚀 Then run: docker compose up -d --build"
