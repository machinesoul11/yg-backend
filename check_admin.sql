-- Check user role and admin roles
SELECT 
  u.id,
  u.email,
  u.name,
  u.role as user_role,
  COUNT(ar.id) as admin_role_count
FROM users u
LEFT JOIN admin_roles ar ON ar.user_id = u.id AND ar.is_active = true
WHERE u.role = 'ADMIN'
GROUP BY u.id, u.email, u.name, u.role
ORDER BY u.created_at DESC
LIMIT 10;
