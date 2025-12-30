#!/bin/bash

# Test Kajabi webhook - Update WEBHOOK_URL to your deployed CRM app URL
# For local testing: http://localhost:3000/api/kajabi-webhook
# For deployed: https://your-crm-app.vercel.app/api/kajabi-webhook

WEBHOOK_URL="${1:-http://localhost:3000/api/kajabi-webhook}"

echo "🧪 Testing Kajabi webhook"
echo "URL: $WEBHOOK_URL"
echo ""

curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "test-123",
    "event": "purchase.created",
    "payload": {
      "member_email": "test.student@example.com",
      "member_name": "Test Student",
      "member_first_name": "Test",
      "member_last_name": "Student",
      "offer_id": 0
    }
  }' \
  -w "\n\n✅ HTTP Status: %{http_code}\n" \
  -v

echo ""
echo "📋 What to check:"
echo "1. Response status should be 200"
echo "2. Check webhook_inbounds table in CRM DB for stored payload"
echo "3. Check students table in Academic DB for created student"
echo "4. Verify offer_id matches kajabi_id in offers table"



