#!/usr/bin/env bash
# TwitchSync — doctor.sh
# Checks your installation for common problems.
# Usage: ./scripts/doctor.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$ROOT_DIR/.env"

PASS="✅"
FAIL="❌"
WARN="⚠️ "

ok=0; fail=0; warn=0

check() {
  local label="$1" result="$2" msg="$3"
  if [ "$result" = "ok" ]; then
    echo "$PASS  $label"
    ((ok++)) || true
  elif [ "$result" = "warn" ]; then
    echo "$WARN $label — $msg"
    ((warn++)) || true
  else
    echo "$FAIL  $label — $msg"
    ((fail++)) || true
  fi
}

echo ""
echo "🔍 TwitchSync Doctor"
echo "================================"

# .env exists
if [ -f "$ENV_FILE" ]; then
  check ".env file exists" "ok" ""
else
  check ".env file exists" "fail" "Run ./scripts/generate-env.sh or cp .env.example .env"
  echo ""; echo "Stopping — .env is required for further checks."; exit 1
fi

source "$ENV_FILE" 2>/dev/null || true

# Required vars
for var in JWT_SECRET DB_PASSWORD TWITCH_CLIENT_ID TWITCH_CLIENT_SECRET PUBLIC_URL; do
  val="${!var}"
  if [ -z "$val" ] || [[ "$val" == *"CHANGE_ME"* ]] || [[ "$val" == *"YOUR_SERVER"* ]] || [[ "$val" == *"your_twitch"* ]]; then
    check "$var is set" "fail" "Still a placeholder — edit .env"
  else
    check "$var is set" "ok" ""
  fi
done

# TWITCH_REDIRECT_URI matches PUBLIC_URL
EXPECTED_REDIRECT="${PUBLIC_URL}/auth/twitch/callback"
if [ "${TWITCH_REDIRECT_URI}" = "$EXPECTED_REDIRECT" ]; then
  check "TWITCH_REDIRECT_URI matches PUBLIC_URL" "ok" ""
else
  check "TWITCH_REDIRECT_URI matches PUBLIC_URL" "warn" \
    "Expected: $EXPECTED_REDIRECT  Got: ${TWITCH_REDIRECT_URI}"
fi

# Port listening
PORT="${FRONTEND_PORT:-2261}"
if command -v nc &>/dev/null; then
  if nc -z localhost "$PORT" 2>/dev/null; then
    check "Frontend port $PORT is listening" "ok" ""
  else
    check "Frontend port $PORT is listening" "fail" "Is docker compose up?"
  fi
else
  check "Frontend port $PORT listening" "warn" "nc not available — skipping port check"
fi

# Backend health
BACKEND_PORT="${PORT:-3501}"
HEALTH_URL="http://localhost:${PORT}/api/health"
if command -v curl &>/dev/null; then
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    check "Backend /api/health returns 200" "ok" ""
  else
    check "Backend /api/health returns 200" "fail" "Got HTTP $HTTP_CODE — is backend running?"
  fi
else
  check "Backend health check" "warn" "curl not available — skipping"
fi

echo ""
echo "================================"
echo "Results: $PASS $ok passed  $FAIL $fail failed  $WARN $warn warnings"
echo ""

if [ "$fail" -gt 0 ]; then
  echo "📌 Twitch redirect URL to register: ${PUBLIC_URL}/auth/twitch/callback"
  exit 1
fi
