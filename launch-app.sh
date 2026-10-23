#!/usr/bin/env bash
# ============================================================
#  NullCord - launch-app (Linux / macOS)
#  Brings up the included backend (Docker / mise) and runs the
#  NullCord client dev server. Auto-restarts on crash.
#
#  Usage:
#     ./launch-app.sh                 # backend + fast production client
#     ./launch-app.sh -Dev            # Vite dev server (HMR, slower)
#     ./launch-app.sh -Build          # rebuild client, then serve production
#     ./launch-app.sh -Install        # force (re)install deps
#     ./launch-app.sh -SkipBackend    # frontend only
#     ./launch-app.sh -SkipFrontend   # backend only
#     ./launch-app.sh -NoRestart      # do not restart on crash
#     ./launch-app.sh -ApiUrl http://127.0.0.1:14702
# ============================================================
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REVITE="$ROOT/revite"
BACKEND="$ROOT/stoat-backend"
YARN="$REVITE/.yarn/releases/yarn-3.2.0.cjs"
DEV_URL="http://127.0.0.1:5173/"

INSTALL=0; SKIP_BACKEND=0; SKIP_FRONTEND=0; NO_RESTART=0; NO_BROWSER=0; DEV_MODE=0; BUILD=0; API_URL=""; PUBLIC_HOST=""; PUBLIC_URL=""
while [ $# -gt 0 ]; do
  case "$1" in
    -Install)      INSTALL=1 ;;
    -Dev)          DEV_MODE=1 ;;
    -Build)        BUILD=1 ;;
    -SkipBackend)  SKIP_BACKEND=1 ;;
    -SkipFrontend) SKIP_FRONTEND=1 ;;
    -NoRestart)    NO_RESTART=1 ;;
    -NoBrowser)    NO_BROWSER=1 ;;
    -ApiUrl)       shift; API_URL="${1:-}" ;;
    -PublicHost)   shift; PUBLIC_HOST="${1:-}" ;;
    -PublicUrl)    shift; PUBLIC_URL="${1:-}" ;;
    *) echo "unknown option: $1" ;;
  esac
  shift
done

have() { command -v "$1" >/dev/null 2>&1; }

if [ "$(id -u)" = "0" ]; then SUDO=""
elif have sudo; then SUDO="sudo"
else SUDO=""; fi

# find a working compose command (v2 plugin or legacy docker-compose)
COMPOSE=""
if docker compose version >/dev/null 2>&1; then COMPOSE="docker compose"
elif have docker-compose; then COMPOSE="docker-compose"
fi

# Docker access needs to work for the current account (group membership is
# only picked up on login, so a fresh 'usermod -aG docker' needs a re-login).
if [ "$SKIP_BACKEND" = 0 ] && have docker && ! docker info >/dev/null 2>&1; then
  echo "[backend] current user cannot access Docker." >&2
  echo "[backend] fix: sudo usermod -aG docker $(id -un) && re-login" >&2
  echo "[backend]   or: sudo chmod 666 /var/run/docker.sock (temporary)" >&2
fi

# clean shutdown: stop the dev server, all backend services, and Caddy on Ctrl+C
CADDY_PID=""
cleanup() {
  echo ""
  echo "[NullCord] shutting down (stopping services + dev server)..."
  trap - INT TERM EXIT
  pkill -f "target/debug/revolt-" 2>/dev/null || true
  [ -n "$CADDY_PID" ] && kill "$CADDY_PID" 2>/dev/null || true
  for j in $(jobs -p 2>/dev/null); do kill "$j" 2>/dev/null || true; done
  exit 0
}
trap cleanup INT TERM

# make rustup's cargo available even in a fresh shell
[ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"

wait_port() { # port [tries]
  local p="$1" tries="${2:-60}" i
  for i in $(seq 1 "$tries"); do
    (exec 3<>"/dev/tcp/127.0.0.1/$p") 2>/dev/null && { exec 3>&- 3<&-; return 0; }
    sleep 1
  done
  return 1
}

echo "============================================================"
echo "  NullCord launcher (linux)"
echo "  project : $ROOT"
echo "  node    : $(have node && node --version || echo 'NOT FOUND')"
echo "  docker  : $(have docker && echo yes || echo no)"
echo "  mise    : $(have mise && echo yes || echo no)"
echo "============================================================"

open_url() {
  [ "$NO_BROWSER" = 1 ] && return
  ( sleep 6
    if have xdg-open; then xdg-open "$DEV_URL" >/dev/null 2>&1
    elif have open; then open "$DEV_URL" >/dev/null 2>&1; fi
  ) &
}

# ---- resolve the network host (browsers on other machines use this) ----
if [ -z "$PUBLIC_HOST" ]; then
  PUBLIC_HOST="$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}')"
fi
[ -z "$PUBLIC_HOST" ] && PUBLIC_HOST="$(hostname -I 2>/dev/null | awk '{print $1}')"
[ -z "$PUBLIC_HOST" ] && PUBLIC_HOST="127.0.0.1"
echo "  host    : $PUBLIC_HOST"

if [ "$SKIP_BACKEND" = 0 ] && [ ! -d "$BACKEND" ]; then
  echo "[backend] ERROR: $BACKEND not found - cannot run the backend." >&2
  echo "[backend] this folder must contain stoat-backend/ and revite/." >&2
  SKIP_BACKEND=1
fi

# ---- decide public URLs (domain vs LAN) ----
if [ -n "$PUBLIC_URL" ]; then
  PUBLIC_URL="${PUBLIC_URL%/}"
  case "$PUBLIC_URL" in https*) WSS="wss" ;; *) WSS="ws" ;; esac
  NO_SCHEME="${PUBLIC_URL#*://}"
  HOST_APP="$PUBLIC_URL"
  HOST_API="$PUBLIC_URL/api"
  HOST_EVENTS="${WSS}://${NO_SCHEME}/ws"
  HOST_AUTUMN="$PUBLIC_URL/autumn"
  HOST_JANUARY="$PUBLIC_URL/january"
  HOST_LIVEKIT="${WSS}://${NO_SCHEME}/livekit"
  DEFAULT_API="$PUBLIC_URL/api"
  echo "  public  : $PUBLIC_URL (via reverse proxy)"
else
  HOST_APP="http://${PUBLIC_HOST}:14701"
  HOST_API="http://${PUBLIC_HOST}:14702"
  HOST_EVENTS="ws://${PUBLIC_HOST}:14703"
  HOST_AUTUMN="http://${PUBLIC_HOST}:14704"
  HOST_JANUARY="http://${PUBLIC_HOST}:14705"
  # LiveKit listens on 7880 (see livekit.yml); 14706 is revolt-gifbox.
  HOST_LIVEKIT="ws://${PUBLIC_HOST}:7880"
  DEFAULT_API="http://${PUBLIC_HOST}:14702"
fi

# Optional override file so a re-run keeps public tunnel URLs instead of
# falling back to LAN http:// addresses.
if [ -f "$ROOT/public-urls.env" ]; then
  # shellcheck disable=SC1091
  . "$ROOT/public-urls.env"
fi

API_URL="${API_URL:-$DEFAULT_API}"
export API_URL

# ---- write backend host config (also disables email verification) ----
if [ -d "$BACKEND" ]; then
cat > "$BACKEND/Revolt.overrides.toml" <<EOF
# NullCord local overrides (auto-generated by launch-app)
[api.registration]
invite_only = false
[api.smtp]
host = ""
[hosts]
app = "${HOST_APP}"
api = "${HOST_API}"
events = "${HOST_EVENTS}"
autumn = "${HOST_AUTUMN}"
january = "${HOST_JANUARY}"
[hosts.livekit]
worldwide = "${HOST_LIVEKIT}"
EOF
fi
export ROCKET_ADDRESS=0.0.0.0
echo "[host] API client will call: $API_URL"

# ---------------- backend ----------------
if [ "$SKIP_BACKEND" = 0 ]; then
  echo ""
  echo "[backend] NullCord backend services"

  if [ -f "$BACKEND/livekit.example.yml" ] && [ ! -f "$BACKEND/livekit.yml" ]; then
    cp "$BACKEND/livekit.example.yml" "$BACKEND/livekit.yml"
    echo "[backend] created livekit.yml from livekit.example.yml"
  fi

  BINS="revolt-delta revolt-bonfire revolt-autumn revolt-january revolt-crond revolt-pushd revolt-gifbox"

  if have mise; then
    echo "[backend] mise run start (docker:start + build + all services) - running in background"
    ( cd "$BACKEND" && mise run start ) &
  elif have docker; then
    echo "[backend] stopping any leftover NullCord services..."
    pkill -f "target/debug/revolt-" 2>/dev/null || true
    sleep 1

    INFRA_OK=1
    if [ -z "$COMPOSE" ] && have apt-get; then
      echo "[backend] docker compose missing - attempting install..."
      $SUDO apt-get update -y >/dev/null 2>&1 || true
      $SUDO apt-get install -y docker-compose-plugin >/dev/null 2>&1 \
        || $SUDO apt-get install -y docker-compose-v2 >/dev/null 2>&1 || true
      if docker compose version >/dev/null 2>&1; then COMPOSE="docker compose"
      elif have docker-compose; then COMPOSE="docker-compose"; fi
    fi
    if [ -z "$COMPOSE" ]; then
      echo "[backend] docker compose is not available." >&2
      echo "[backend] install it, then re-run:" >&2
      echo "[backend]   sudo apt-get update && sudo apt-get install -y docker-compose-plugin" >&2
      echo "[backend]   (older Ubuntu: sudo apt-get install -y docker-compose-v2)" >&2
      INFRA_OK=0
    else
      echo "[backend] starting infra ($COMPOSE up -d)..."
      if ! ( cd "$BACKEND" && $COMPOSE up -d ); then
        echo "[backend] '$COMPOSE up -d' failed - see errors above." >&2
        INFRA_OK=0
      fi
    fi

    if [ "$INFRA_OK" = 1 ]; then
      echo "[backend] waiting for Mongo(27017), Redis(6379), Rabbit(5672)..."
      for p in 27017 6379 5672; do
        if wait_port "$p" 60; then echo "  port $p up"; else echo "  port $p NOT reachable" >&2; INFRA_OK=0; fi
      done
    fi

    if [ "$INFRA_OK" = 1 ]; then
      echo "[backend] waiting for MongoDB replica set to initialise..."
      mongo_ready=0
      for i in $(seq 1 90); do
        if ( cd "$BACKEND" && $COMPOSE exec -T database mongosh --quiet --eval 'rs.status().ok' 2>/dev/null | grep -q 1 ); then
          mongo_ready=1; echo "  mongo replica set ready"; break
        fi
        sleep 1
      done
      if [ "$mongo_ready" != 1 ]; then
        echo "[backend] MongoDB never became ready - not starting services." >&2
        echo "[backend] check:  ( cd \"$BACKEND\" && $COMPOSE logs --tail=40 database )" >&2
        INFRA_OK=0
      fi
    fi
    if [ "$INFRA_OK" != 1 ]; then
      echo "[backend] infra is not fully up - services would crash with ConnectionRefused." >&2
      echo "[backend] check:  ( cd \"$BACKEND\" && docker compose logs --tail=50 )" >&2
      echo "[backend] images come from mirror.gcr.io - failed pulls are a common cause." >&2
    fi

    # Prefer binaries that already exist (e.g. built on this box earlier or
    # shipped prebuilt); only invoke cargo if something is actually missing.
    missing_bins=""
    for bin in $BINS; do
      [ -x "$BACKEND/target/debug/$bin" ] || missing_bins="$missing_bins $bin"
    done

    if [ -n "$missing_bins" ]; then
      if have cargo; then
        echo "[backend] missing:$missing_bins - building once (first build is slow)..."
        if have apt-get; then
          $SUDO apt-get update -y >/dev/null 2>&1 || true
          $SUDO apt-get install -y libdav1d-dev pkg-config libssl-dev build-essential >/dev/null 2>&1 || true
        fi
        ( cd "$BACKEND" && cargo build ) || echo "[backend] BUILD FAILED" >&2
      else
        echo "[backend] prebuilt binaries missing:$missing_bins" >&2
        echo "[backend] install Rust (https://rustup.rs) and re-run, or drop in prebuilt binaries." >&2
      fi
      missing_bins=""
      for bin in $BINS; do
        [ -x "$BACKEND/target/debug/$bin" ] || missing_bins="$missing_bins $bin"
      done
    fi

    if [ -n "$missing_bins" ]; then
      echo "[backend] cannot start services - still missing:$missing_bins" >&2
    elif [ "$INFRA_OK" != 1 ]; then
      echo "[backend] binaries ready but infra is down - not starting services." >&2
    else
      pkill -f "target/debug/revolt-" 2>/dev/null || true
      mkdir -p "$BACKEND/logs"
      for bin in $BINS; do
        echo "[backend] starting $bin (log: stoat-backend/logs/$bin.log)"
        ( cd "$BACKEND"
          fails=0
          while true; do
            ./target/debug/"$bin" >> "logs/$bin.log" 2>&1
            rc=$?
            if [ "$rc" -eq 0 ]; then fails=0; else fails=$((fails + 1)); fi
            if [ "$fails" -ge 5 ]; then
              echo "[backend] $bin keeps failing (see stoat-backend/logs/$bin.log) - giving up"
              break
            fi
            echo "[backend] $bin stopped (rc=$rc); restarting in 3s"
            sleep 3
          done
        ) &
      done
      if wait_port 14702 60; then
        echo "[backend] API is up on http://127.0.0.1:14702"
      else
        echo "[backend] WARNING: API not answering on 14702 yet - check stoat-backend/logs/" >&2
      fi
    fi
  else
    echo "[backend] Docker not found (needed for Mongo/KeyDB/MinIO/Rabbit/LiveKit)."
    echo "[backend] Install Docker Engine, or run the client with -SkipBackend against a reachable API."
  fi
fi

# ---------------- frontend ----------------
if [ "$SKIP_FRONTEND" = 0 ]; then
  echo ""
  if ! have node; then
    echo "[frontend] Node.js not found. Install Node 20+ then re-run." >&2
    exit 1
  fi
  if [ ! -f "$YARN" ]; then
    echo "[frontend] yarn release missing at $YARN" >&2
    exit 1
  fi

  printf '# NullCord backend API URL (set by launch-app)\nVITE_API_URL=%s\nVITE_THEMES_URL=\nVITE_ADMIN_URL=%s\nVITE_DISCOVER_INVITE=%s\n' "$API_URL" "${ADMIN_URL:-}" "${DISCOVER_INVITE:-}" > "$REVITE/.env"
  echo "[frontend] VITE_API_URL -> $API_URL"

  cd "$REVITE"

  # deps copied from another OS won't run (e.g. esbuild-windows-64 on Linux) - reinstall
  if [ -d node_modules ] && [ -d node_modules/esbuild-windows-64 ] && [ ! -d node_modules/esbuild-linux-64 ]; then
    echo "[frontend] node_modules was built on another platform - wiping and reinstalling"
    rm -rf node_modules .yarn/install-state.gz
    INSTALL=1
  fi

  if [ "$INSTALL" = 1 ] || [ ! -d node_modules ]; then
    echo "[frontend] installing dependencies (yarn 3)"
    node "$YARN" install
  fi

  ensure_external() {
    dir="$1"; script="$2"; out="$3"
    [ -d "$dir" ] || return 0
    y="$(ls "$dir"/.yarn/releases/*.cjs 2>/dev/null | head -n1)"
    [ -n "$y" ] || y="$YARN"
    if [ "$INSTALL" = 1 ] || [ ! -e "$dir/$out" ]; then
      echo "[frontend] $(basename "$dir") : yarn install"
      ( cd "$dir" && node "$y" install )
      echo "[frontend] $(basename "$dir") : yarn $script"
      ( cd "$dir" && node "$y" run "$script" )
    else
      echo "[frontend] $(basename "$dir") : up to date"
    fi
  }
  echo "[frontend] building external packages (revolt.js + components)"
  ensure_external "$REVITE/external/revolt.js" "build" "dist"
  ensure_external "$REVITE/external/components" "build:esm" "esm"

  if [ "$DEV_MODE" = 0 ] && { [ "$BUILD" = 1 ] || [ ! -f "$REVITE/dist/index.html" ] || [ -n "$(find "$REVITE/src" -newer "$REVITE/dist/index.html" -print -quit 2>/dev/null)" ] || [ "$REVITE/vite.config.ts" -nt "$REVITE/dist/index.html" ]; }; then
    echo "[frontend] building production client (this takes a few minutes)"
    ( cd "$REVITE" && node "$YARN" build ) || echo "[frontend] build failed; falling back to dev server"
  fi

  if [ -n "$PUBLIC_URL" ] && have caddy && [ -f "$ROOT/dev-proxy.Caddyfile" ]; then
    echo "[frontend] starting Caddy reverse proxy on :8080 (for $PUBLIC_URL)"
    ( cd "$ROOT" && caddy run --config dev-proxy.Caddyfile ) &
    CADDY_PID=$!
  elif [ -n "$PUBLIC_URL" ]; then
    echo "[frontend] NOTE: point your reverse proxy / tunnel at a proxy that routes /api + /ws"
    echo "[frontend]       to the backend; e.g.  caddy run --config dev-proxy.Caddyfile  (:8080)"
  fi

  if [ "$DEV_MODE" = 0 ] && [ -f "$REVITE/dist/index.html" ]; then
    echo "[frontend] production client (fast) -> $DEV_URL  (Ctrl+C to stop)"
    echo "[frontend] local: http://127.0.0.1:5173/   network: http://${PUBLIC_HOST}:5173/"
    open_url
    while true; do
      node "$ROOT/serve-client.js"
      if [ "$NO_RESTART" = 1 ]; then break; fi
      echo "[frontend] production server stopped. Restarting in 3s... (Ctrl+C to quit)"
      sleep 3
    done
  else
    echo "[frontend] yarn dev --host (listening on 0.0.0.0) -> $DEV_URL  (Ctrl+C to stop)"
    echo "[frontend] local: http://127.0.0.1:5173/   network: http://${PUBLIC_HOST}:5173/"
    open_url
    while true; do
      node "$YARN" dev --host
      if [ "$NO_RESTART" = 1 ]; then break; fi
      echo "[frontend] dev server stopped. Restarting in 3s... (Ctrl+C to quit)"
      sleep 3
    done
  fi
fi

echo ""
echo "[NullCord] done."
