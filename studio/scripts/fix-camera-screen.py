#!/usr/bin/env python3
import re

path = r'C:\Users\A.r.r.a.y.19\fremio\studio\src\app\(booth)\b\[slug]\screens\CameraScreen.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# The pattern to remove: the count===cd arm block (between setCountdown(count) and countdownTimerRef)
# Find the arm block and remove it
old = '''        if (willUseAgentCapture) {
          if (count === cd) {
            // /arm-capture: arms camera WITHOUT stopping preview.
            // Use agentBase prop (BoothSetupScreen detection = 3002),
            // NOT agentBaseRef.current (stale sessionStorage = 7432).
            if (agentBase) {
              fetch(`${agentBase}/arm-capture`, { method: "POST", signal: AbortSignal.timeout(30000) })
                .catch((e) => console.warn("[CameraScreen] arm-capture error:", e));
            }
          }

          if (count === 1) {'''

new = '''        if (willUseAgentCapture) {
          if (count === 1) {'''

if old in content:
    content = content.replace(old, new)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Replaced OK")
else:
    print("Pattern not found")
    # Try to find the arm block
    idx = content.find('if (count === cd)')
    if idx >= 0:
        print(f"Found 'count === cd' at index {idx}")
        print(repr(content[max(0,idx-200):idx+200]))
    else:
        print("'count === cd' not found at all")
