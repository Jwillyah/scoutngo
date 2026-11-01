#!/usr/bin/env bash
#
# THE BROWSER HALF OF THE GATE, with nothing live: one built server, one
# proxied Chrome, every audit side by side. Run by .githooks/pre-commit after
# the build; runnable by hand the same way (bash scripts/gate/browser-gate.sh
# [audit name ...]) against whatever is in dist/.
#
# Ports of its own (app 5180, proxy 5181, Chrome 9333 and 9334), so a dev server on
# 5173 or a Chrome on 9222 somebody is using is never touched.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1

RED=$'\033[31m'; GREEN=$'\033[32m'; DIM=$'\033[2m'; OFF=$'\033[0m'
OUT="${SCOUTNGO_OUT:-$(mktemp -d)}"
mkdir -p "$OUT"
export SCOUTNGO_OUT="$OUT"
export SCOUTNGO_APP=http://127.0.0.1:5180
export SCOUTNGO_PROXY=http://127.0.0.1:5181
export SCOUTNGO_CDP=http://127.0.0.1:9333
up() { curl -s -o /dev/null -m 2 "$1" 2>/dev/null; }

PIDS=()
cleanup() { for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null; done; }
trap cleanup EXIT

# Our own leftovers from an interrupted run, and only ours (matched by script and port).
pkill -f 'node scripts/gate/server.mjs' 2>/dev/null
pkill -f 'remote-debugging-port=933[34]' 2>/dev/null
for _ in $(seq 1 20); do up "$SCOUTNGO_APP/" || up http://127.0.0.1:9333/json/version || break; sleep 0.25; done

[ -f dist/index.html ] || { echo "${RED}✗ no dist/: build first${OFF}"; exit 1; }
node scripts/gate/server.mjs > "$OUT/gate-server.log" 2>&1 &
PIDS+=($!)
for _ in $(seq 1 40); do up "$SCOUTNGO_APP/__gate/ledger" && break; sleep 0.25; done
up "$SCOUTNGO_APP/__gate/ledger" || { cat "$OUT/gate-server.log"; echo "${RED}✗ the gate server did not start${OFF}"; exit 1; }
echo "${GREEN}✓ $(head -1 "$OUT/gate-server.log")${OFF}"

CHROME="$(node -e "import('./scripts/preflight.mjs').then(m => console.log(m.findChrome() ?? ''))")"
[ -n "$CHROME" ] || { echo "${RED}✗ no Chrome found for the browser audits${OFF}"; exit 1; }
# Two Chromes behind the proxy: 9333 for the many audits, at low priority
# (nice), and 9334 at normal priority for the timed lane (scripts/gate/run-audits.mjs).
start_chrome() {
  local port="$1" prio="$2" args=()
  while IFS= read -r a; do args+=("$a"); done < <(node -e "import('./scripts/preflight.mjs').then(m => console.log(m.chromeArgs(+process.argv[1], process.argv[2]).join('\n')))" "$port" "$OUT/chrome-$port")
  nice -n "$prio" "$CHROME" "${args[@]}" > "$OUT/chrome-$port.log" 2>&1 &
  PIDS+=($!)
}
start_chrome 9333 15
start_chrome 9334 0
for port in 9333 9334; do
  for _ in $(seq 1 40); do curl -s -m 2 "http://127.0.0.1:$port/json/list" | grep -q '"type": *"page"' && break; sleep 0.5; done
  curl -s -m 2 "http://127.0.0.1:$port/json/list" | grep -q '"type": *"page"' || { echo "${RED}✗ Chrome on :$port did not start${OFF}"; exit 1; }
done
export SCOUTNGO_CDP_TIMED=http://127.0.0.1:9334
echo "${GREEN}✓ Chrome on :9333 and :9334 (the timed lane), behind the fixture proxy${OFF}"

node scripts/gate/run-audits.mjs "$@"
