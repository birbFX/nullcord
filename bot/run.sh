#!/usr/bin/env bash
# Start / stop the Canyon Lake Labs NullCord bot.
#   ./run.sh start|stop|restart|status|logs
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="$DIR/bin:$HOME/.local/bin:$PATH"
PIDFILE="$DIR/data/bot.pid"
LOGFILE="$DIR/data/bot.log"

log() { printf '%s %s\n' "$(date '+%H:%M:%S')" "$*"; }

running_pid() {
    [ -f "$PIDFILE" ] || return 1
    local p; p="$(cat "$PIDFILE" 2>/dev/null)"
    [ -n "$p" ] && kill -0 "$p" 2>/dev/null && { echo "$p"; return 0; }
    return 1
}

start() {
    local pid
    if pid="$(running_pid)"; then log "already running (pid $pid)"; return 0; fi
    mkdir -p "$DIR/data"
    setsid nohup node "$DIR/bot.js" >> "$LOGFILE" 2>&1 < /dev/null &
    pid=$!
    echo "$pid" > "$PIDFILE"
    for _ in $(seq 1 50); do
        if grep -q 'ready as' "$LOGFILE" 2>/dev/null; then
            log "started (pid $pid)"
            tail -n 2 "$LOGFILE"
            return 0
        fi
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.2
    done
    log "failed to start - log tail:"
    tail -n 10 "$LOGFILE"
    return 1
}

stop() {
    local pid
    if pid="$(running_pid)"; then
        kill -TERM "$pid" 2>/dev/null || true
        for _ in $(seq 1 20); do kill -0 "$pid" 2>/dev/null || break; sleep 0.2; done
        kill -KILL "$pid" 2>/dev/null || true
        log "stopped (pid $pid)"
    else
        log "not running"
    fi
    rm -f "$PIDFILE"
}

case "${1:-start}" in
    start) start ;;
    stop) stop ;;
    restart) stop; start ;;
    status) if p="$(running_pid)"; then echo "running pid $p"; else echo stopped; fi ;;
    logs) tail -n "${2:-50}" -f "$LOGFILE" ;;
    *) echo "usage: $0 {start|stop|restart|status|logs}" >&2; exit 2 ;;
esac
