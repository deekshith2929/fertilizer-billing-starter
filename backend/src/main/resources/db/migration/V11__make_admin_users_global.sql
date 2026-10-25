UPDATE app_users u
SET dealer_id = NULL
WHERE EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = u.id AND r.role_code = 'ADMIN'
);
