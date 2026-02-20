#!/bin/bash
# Test upload 8MB file to fremio.id

echo "=== Test Large File Upload ==="
echo ""

# 1. Check bundle version
echo "1. Checking bundle version..."
BUNDLE=$(curl -s "https://fremio.id/?t=$(date +%s)" | grep -o 'index-[a-z0-9]*-[A-Za-z0-9]*\.js' | head -1)
echo "   Current bundle: $BUNDLE"
echo ""

# 2. Test if old bundle is gone
echo "2. Testing old bundle (should be 404)..."
OLD_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://fremio.id/assets/index-mlon3eg4-C2NN7n7s.js")
echo "   Old bundle status: $OLD_STATUS (should be 404)"
echo ""

# 3. Test if new bundle exists
echo "3. Testing new bundle (should be 200)..."
NEW_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://fremio.id/assets/index-mlqhrk95-C0kXXYuv.js")
echo "   New bundle status: $NEW_STATUS (should be 200)"
echo ""

# 4. Instructions
echo "4. Now test in browser:"
echo "   a. Open Safari"
echo "   b. Press Cmd+Shift+Delete to clear history"
echo "   c. Select 'All history' and clear"
echo "   d. Quit Safari completely (Cmd+Q)"
echo "   e. Reopen and go to: https://fremio.id/?fresh=$(date +%s)"
echo ""
echo "5. In browser console, you should see: index-mlqhrk95"
echo ""
echo "=== Done ==="
