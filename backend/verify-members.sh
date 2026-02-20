#!/bin/bash
# Quick verification script for member import

echo "=========================================="
echo "Member Import Verification"
echo "=========================================="
echo ""

# Database connection
DB_HOST="localhost"
DB_PORT="5432"
DB_NAME="fremio"
DB_USER="fremio_user"

# Count active members
echo "1. Active Members Count:"
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "
  SELECT COUNT(*) as total_active 
  FROM user_package_access 
  WHERE is_active = true AND access_end > NOW();
"

echo ""
echo "2. Members by Payment Method:"
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "
  SELECT 
    pt.payment_method,
    COUNT(*) as count
  FROM user_package_access upa
  JOIN payment_transactions pt ON pt.id = upa.transaction_id
  WHERE upa.is_active = true
  GROUP BY pt.payment_method
  ORDER BY count DESC;
"

echo ""
echo "3. Sample Active Members (First 10):"
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "
  SELECT 
    u.email,
    pt.invoice_number as order_id,
    upa.access_end,
    EXTRACT(DAY FROM (upa.access_end - NOW())) as days_remaining
  FROM user_package_access upa
  JOIN users u ON u.id::text = upa.user_id::text
  JOIN payment_transactions pt ON pt.id = upa.transaction_id
  WHERE upa.is_active = true
  ORDER BY u.email
  LIMIT 10;
"

echo ""
echo "4. Access Expiration Date:"
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "
  SELECT DISTINCT access_end::date as expiration_date 
  FROM user_package_access 
  WHERE is_active = true
  LIMIT 1;
"

echo ""
echo "5. Total Revenue:"
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "
  SELECT 
    'Rp ' || TO_CHAR(SUM(pt.amount), 'FM999,999,999') as total_revenue
  FROM user_package_access upa
  JOIN payment_transactions pt ON pt.id = upa.transaction_id
  WHERE upa.is_active = true;
"

echo ""
echo "=========================================="
echo "✅ Verification Complete"
echo "=========================================="
