#!/bin/bash

echo "🧪 Testing Payment Webhook System"
echo "=================================="
echo ""

# Test 1: Check if backend is running
echo "1️⃣ Checking if backend is running..."
BACKEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://fremio.id/api/payment/webhook -X OPTIONS 2>/dev/null)

if [ "$BACKEND_STATUS" = "000" ]; then
  echo "   ❌ Backend not reachable"
  exit 1
else
  echo "   ✅ Backend is reachable (Status: $BACKEND_STATUS)"
fi

echo ""

# Test 2: Send test webhook with minimal data
echo "2️⃣ Sending test webhook notification..."
RESPONSE=$(curl -s -X POST https://fremio.id/api/payment/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "order_id": "TEST-VALIDATE-ONLY",
    "transaction_status": "settlement",
    "transaction_id": "test-123",
    "payment_type": "qris",
    "gross_amount": "10000.00"
  }' 2>&1)

echo "   Response: $RESPONSE"
echo ""

# Check response
if echo "$RESPONSE" | grep -q "success"; then
  if echo "$RESPONSE" | grep -q '"success":true'; then
    echo "   ✅ Webhook handler responded successfully"
  else
    echo "   ⚠️ Webhook handler responded but with error:"
    echo "   $RESPONSE"
  fi
else
  echo "   ❌ Webhook handler error:"
  echo "   $RESPONSE"
fi

echo ""
echo "=================================="
echo ""
echo "💡 Interpretation:"
echo ""
echo "✅ If you see 'success:true' - Payment system is working!"
echo "   New payments will auto-activate membership"
echo ""
echo "⚠️ If you see errors about verification - That's normal for test data"
echo "   Real Midtrans notifications will work correctly"
echo ""
echo "❌ If you see connection errors - Backend might be down"
echo "   Check: ssh root@76.13.192.32 'pm2 status'"
echo ""
