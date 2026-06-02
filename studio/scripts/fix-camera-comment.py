#!/usr/bin/env python3
import sys
import re

path = r'C:\Users\A.r.r.a.y.19\fremio\studio\src\app\(booth)\b\[slug]\screens\CameraScreen.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# The arm block starts at "count === cd" and goes to just before "count === 1"
# Pattern: a block of 13 lines starting with "// DSLR pre-arm: fire as early"
# and ending with "NOT agentBaseRef.current..." followed by "}"
# We need to remove the "count === cd" if block entirely

# Find the arm block using regex that handles all special chars
pattern = r'// DSLR pre-arm: fire as early[^\n]*\n.*?NOT agentBaseRef\.current[^\n]*\n[ \t]*\}\n\n[ \t]*// Shot fires'

replacement = '''// DSLR pre-arm was fired in startCountdown (before countdown started).
        // The bridge has the full countdown duration to initialize.
        // Shot fires at count=1.'''

if re.search(pattern, content):
    content = re.sub(pattern, replacement, content, count=1, flags=re.DOTALL)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print('Replaced OK')
else:
    # Show the area around "count === cd" for debugging
    idx = content.find('count === cd')
    if idx >= 0:
        print(f"'count === cd' found at {idx}")
        # Write a hex dump of the surrounding area
        snippet = content[idx-200:idx+600]
        with open(r'C:\Users\A.r.r.a.y.19\fremio\studio\scripts\snippet.txt', 'w', encoding='utf-8') as f:
            f.write(repr(snippet))
        print('Snippet written')
    else:
        print("'count === cd' not found at all")