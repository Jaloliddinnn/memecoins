#!/usr/bin/env bash
# Pull, install, kill whatever is already on the port, restart the panel.
#
#     cd ~/memecoins/sniper && ./up.sh
#
# The page is baked into ui.mjs when the process starts, so `git pull` on its
# own changes nothing you can see. This is the whole update, in one command.

set -u
cd "$(dirname "$0")/.." || exit 1

PORT="${UI_PORT:-4321}"

echo "==> updating"
git pull --ff-only || {
  echo
  echo "  Pull failed. Usually local edits to tracked files. To throw them away:"
  echo "      git checkout -- . && git pull"
  echo "  Your .env and config.json are untracked and are never touched by this."
  exit 1
}

echo
echo "==> stopping anything on port $PORT"
# lsof on macOS, fuser as the Linux fallback. Neither existing is fine.
if command -v lsof >/dev/null 2>&1; then
  PIDS=$(lsof -ti "tcp:$PORT" 2>/dev/null)
  [ -n "$PIDS" ] && kill $PIDS 2>/dev/null && sleep 1
elif command -v fuser >/dev/null 2>&1; then
  fuser -k "$PORT/tcp" 2>/dev/null && sleep 1
fi

cd sniper || exit 1

echo
echo "==> installing"
npm install --silent || exit 1

echo
echo "==> starting  (build $(git rev-parse --short HEAD))"
echo "    http://127.0.0.1:$PORT"
echo
echo "    From now on use the Update button in the page — it pulls and"
echo "    restarts itself. You should not need this terminal again."
echo

# Exit code 75 means "the Update button pulled new code, bring me back up".
# Anything else is a real exit and the loop ends.
while true; do
  node ui.mjs
  code=$?
  [ "$code" -eq 75 ] || exit "$code"
  echo
  echo "==> restarting into $(git rev-parse --short HEAD)"
  npm install --silent
done
