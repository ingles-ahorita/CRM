#!/bin/bash

# Test script for Kajabi webhook
# Update the URL to match your deployed CRM app or use localhost:3000 for local testing

WEBHOOK_URL="${WEBHOOK_URL:-http://localhost:3000/api/kajabi-webhook}"

echo "Testing Kajabi webhook at: $WEBHOOK_URL"
echo ""

curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "f36e8f76-e02e-11f0-921d-4b2732f24088",
    "event": "purchase.created",
    "payload": {
      "affiliate_conversion_id": 0,
      "affiliate_user_id": 0,
      "affiliate_user_name": "Kajabi Test Affiliate",
      "affiliate_user_email": "nobody.affiliate@kajabi.com",
      "contact_address_line_1": "100 Example Drive",
      "contact_address_line_2": "Suite 200G",
      "contact_address_city": "Irvine",
      "contact_address_country": "US",
      "contact_address_country_name": "United States of America",
      "contact_address_state": "CA",
      "contact_address_zip": "92620",
      "contact_phone_number": "949-555-1212",
      "offer_id": 0,
      "offer_title": "Kajabi Test Offer",
      "offer_reference": "kajabi_offer_0",
      "opt_in": false,
      "trial": false,
      "member_id": 0,
      "member_email": "test.student@example.com",
      "member_name": "Test Student",
      "member_first_name": "Test",
      "member_last_name": "Student",
      "transaction_id": 1234567890,
      "transaction_created_at": "2025-12-23T18:41:10.547+00:00",
      "offer_type": "subscription",
      "subtotal": 1250,
      "subtotal_decimal": 12.5,
      "discount_amount": 0,
      "discount_amount_decimal": 0,
      "amount_paid": 1250,
      "amount_paid_decimal": 12.5,
      "currency": "USD",
      "payment_method": "visa",
      "payment_processor": "Kajabi Payments",
      "coupon_code": "10OFF",
      "subscription_id": 1234567890,
      "subscription_created_at": "2025-12-23T18:41:10.547+00:00",
      "interval_payment_amount": 1250,
      "interval_payment_amount_decimal": 12.5,
      "interval_count": 1,
      "interval": "month",
      "trial_period_days": null,
      "setup_fee": 0,
      "setup_fee_decimal": 0,
      "quantity": 1
    }
  }' \
  -w "\n\nHTTP Status: %{http_code}\n"

echo ""
echo "Check the response above and verify:"
echo "1. Payload was stored in webhook_inbounds table (CRM DB)"
echo "2. Offer was looked up by offer_id"
echo "3. Student was created in academic app"


