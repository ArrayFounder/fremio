import re

path = "/root/fremio-studio/studio/agent/src/server.ts"

with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# OLD block after res.json/send(buf) in pre-armed path:
old_block = """      // Restart preview after 5s (when block expires), not immediately.
      // This gives USB session time to fully release.
      if (hadPreviewSession) {
        setTimeout(() => { try { startSharedPreviewProcess(); } catch { /* ignore */ } }, 5000);
      }
      return;"""

# NEW block with polling checkAndStart:
new_block = """      // IMPORTANT: call startSharedPreviewProcess() directly -- don't rely on
      // hasPreviewDemand() which returns false after capture (no active subscribers
      // yet, because the browser's polling hasn't resumed). Without this direct
      // call, preview stays dead for session 2 onwards.
      if (hadPreviewSession) {
        const PREVIEW_RESTART_DELAY_MS = 5000;
        const previewRestartAt = Date.now() + PREVIEW_RESTART_DELAY_MS;
        console.log("[agent] /capture: scheduling preview restart at t+" + PREVIEW_RESTART_DELAY_MS + "ms");
        const checkAndStart = () => {
          if (Date.now() >= previewRestartAt) {
            console.log("[agent] /capture: preview block expired, calling startSharedPreviewProcess()");
            try { startSharedPreviewProcess(); } catch { /* ignore */ }
          } else {
            setTimeout(checkAndStart, 200);
          }
        };
        setTimeout(checkAndStart, 200);
      }
      return;"""

if old_block in content:
    content = content.replace(old_block, new_block, 1)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("SUCCESS: replaced pre-armed path preview restart")
else:
    print("ERROR: old block not found in file")
    idx = content.find("Restart preview after 5s")
    if idx >= 0:
        print("Found 'Restart preview after 5s' at idx", idx)
        print(repr(content[idx-50:idx+200]))
    else:
        print("'Restart preview after 5s' NOT found")