INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.permission_code IN ('DEALER_MANAGE', 'USER_MANAGE')
WHERE r.role_code = 'ADMIN'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.permission_code IN (
    'BILLING_USE',
    'PRODUCT_VIEW',
    'PRODUCT_MANAGE',
    'DEALER_PRICE_MANAGE',
    'STOCK_REPORT_VIEW',
    'COMPANY_LEDGER_VIEW',
    'CUSTOMER_LEDGER_VIEW',
    'USER_MANAGE'
)
WHERE r.role_code = 'DEALER'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.permission_code IN (
    'BILLING_USE',
    'PRODUCT_VIEW',
    'PRODUCT_MANAGE',
    'DEALER_PRICE_MANAGE',
    'STOCK_REPORT_VIEW',
    'COMPANY_LEDGER_VIEW',
    'CUSTOMER_LEDGER_VIEW'
)
WHERE r.role_code = 'EMPLOYEE'
ON CONFLICT DO NOTHING;
