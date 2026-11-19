#!/bin/sh
# Start the Ethara image agent detached from whatever shell launched it, so it keeps
# running when that shell (or an agent's task) goes away. Logs to server.log.
cd "$(dirname "$0")" || exit 1
NODE="${SMA_NODE:-/private/tmp/claude-501/-Users-macbookpro-Downloads-Image-gen-agent/edcff019-3e6c-4126-955b-f757fb44f8fd/scratchpad/node-v24.22.3-darwin-arm64/bin/node}"
[ -x "$NODE" ] || NODE="$(command -v node)"
[ -x "$NODE" ] || { echo "No usable node found. Run: brew reinstall node"; exit 1; }

if lsof -nP -iTCP:4317 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Already running on http://127.0.0.1:4317 (pid $(lsof -nP -tiTCP:4317 -sTCP:LISTEN | head -1))"
  exit 0
fi
python3 - "$NODE" <<'PY'
import subprocess, sys, os
log = open("server.log", "ab")
p = subprocess.Popen([sys.argv[1], "server.mjs"], stdout=log, stderr=log,
                     stdin=subprocess.DEVNULL, start_new_session=True, cwd=os.getcwd())
open(".server.pid", "w").write(str(p.pid))
print("started pid", p.pid)
PY
sleep 3
lsof -nP -iTCP:4317 -sTCP:LISTEN >/dev/null 2>&1 \
  && echo "Ethara image agent → http://127.0.0.1:4317" \
  || { echo "Failed to start; see server.log"; tail -5 server.log; exit 1; }
