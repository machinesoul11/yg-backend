-- Script to grant SUPER_ADMIN role to an admin user
-- Replace 'your-email@example.com' with your actual email

-- First, find your user ID
SELECT id, email, name, role FROM users WHERE email = 'your-email@example.com';

-- Then create a SUPER_ADMIN role for yourself
-- Replace 'YOUR_USER_ID_HERE' with the ID from above
INSERT INTO admin_roles (
  id,
  user_id,
  department,
  seniority,
  permissions,
  is_active,
  created_at,
  created_by
)
VALUES (
  gen_random_uuid()::text, -- Or use cuid() if available
  'YOUR_USER_ID_HERE', -- Replace with your user ID
  'SUPER_ADMIN',
  'SENIOR',
  '["*:*"]'::jsonb, -- Wildcard permission = full access
  true,
  NOW(),
  'YOUR_USER_ID_HERE' -- Self-assigned
)
ON CONFLICT DO NOTHING;

-- Verify it was created
SELECT 
  ar.id,
  ar.department,
  ar.seniority,
  ar.permissions,
  ar.is_active,
  u.email
FROM admin_roles ar
JOIN users u ON u.id = ar.user_id
WHERE ar.department = 'SUPER_ADMIN'
  AND ar.is_active = true;
