#!/bin/bash
# Simple webhook test using curl

echo "🧪 Testing Payment Webhook..."
echo ""
echo "Sending test notification to webhook..."
echo ""

# Create test order ID
ORDER_ID="TEST-$(date +%s)"

# Send webhook notification
curl -X POST http://localhost:5000/api/payment/webhook \
  -H "Content-Type: application/json" \
  -d "{
    \"transaction_time\": \"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\",
    \"transaction_status\": \"settlement\",
    \"transaction_id\": \"midtrans-$(date +%s)\",
    \"status_message\": \"midtrans payment notification\",
    \"status_code\": \"200\",
    \"settlement_time\": \"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\",
    \"payment_type\": \"qris\",
    \"order_id\": \"$ORDER_ID\",
    \"merchant_id\": \"G812785002\",
    \"gross_amount\": \"10000.00\",
    \"fraud_status\": \"accept\",
    \"currency\": \"IDR\"
  }" \
  -w "\n\nHTTP Status: %{http_code}\n"

echo ""
echo "✅ Test completed"
echo ""
echo "Check PM2 logs to see if webhook was processed:"
echo "  pm2 logs backend --lines 50"
