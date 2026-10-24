INSERT INTO app_users(username, password_hash, full_name, dealer_id)
SELECT 'admin', 'pbkdf2_sha256$310000$j2obScJOc6BdmyDINtFy7w==$GT0Cj/wmpgcvW2OLDuZoi+vQq6FMZtK1jnBwO27Azvo=',
       'Demo Admin', id
FROM dealers
WHERE dealer_code = 'DEMO-001'
ON CONFLICT (username) DO NOTHING;

INSERT INTO user_roles(user_id, role_id)
SELECT u.id, r.id
FROM app_users u
CROSS JOIN roles r
WHERE u.username = 'admin' AND r.role_code = 'ADMIN'
ON CONFLICT (user_id, role_id) DO NOTHING;
