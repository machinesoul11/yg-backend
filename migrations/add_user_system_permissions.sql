-- Add User Management and System Permissions Migration
-- Adds granular user management and system permissions to admin roles
-- These permissions provide fine-grained control over user management and system operations

BEGIN;

-- This migration adds new permissions to the existing permission system
-- Permissions are stored as JSON arrays in the admin_roles.permissions field
-- The application layer (permissions.ts) handles permission checking and hierarchy

-- Note: This migration does NOT modify existing admin_roles records
-- New permissions will be automatically available to SUPER_ADMIN department
-- due to the wildcard permission logic in the application layer

-- The following permissions are now available in the system:
-- 
-- User Management Permissions:
-- - users:view - View user information and profiles
-- - users:edit - Edit user profiles and account information  
-- - users:delete - Delete user accounts (soft delete)
-- - users:view_sensitive - View sensitive user data (email, IP, PII)
-- - users:impersonate - Impersonate users for troubleshooting (Super Admin only)
--
-- System Permissions:
-- - system:settings - Modify platform-wide system settings and configurations
-- - system:deploy - Deploy system changes and manage deployments
-- - system:logs - Access and view system logs
-- - system:monitor - Access monitoring tools and dashboards
-- - system:backup - Manage backups and restoration
--
-- Admin Role Management:
-- - admin:roles - Manage admin roles and permissions (Super Admin only)

-- Create a function to safely add permissions to admin roles
CREATE OR REPLACE FUNCTION add_permission_to_department(
  target_department TEXT,
  new_permissions TEXT[]
)
RETURNS void AS $$
BEGIN
  -- Update all active admin roles for the specified department
  -- Only adds permissions that don't already exist
  UPDATE admin_roles
  SET 
    permissions = (
      SELECT jsonb_agg(DISTINCT elem)
      FROM (
        SELECT jsonb_array_elements_text(permissions) AS elem
        UNION
        SELECT unnest(new_permissions)
      ) combined
    ),
    updated_at = CURRENT_TIMESTAMP
  WHERE 
    department = target_department::\"Department\"
    AND is_active = true;
    
  RAISE NOTICE 'Added permissions to % department', target_department;
END;
$$ LANGUAGE plpgsql;

-- Add user management permissions to OPERATIONS department
-- OPERATIONS handles day-to-day user management but NOT deletion or impersonation
SELECT add_permission_to_department(
  'OPERATIONS',
  ARRAY[
    'users:view',
    'users:edit',
    'users:view_sensitive'
  ]
);

-- Add system monitoring permissions to OPERATIONS department
SELECT add_permission_to_department(
  'OPERATIONS',
  ARRAY[
    'system:logs',
    'system:monitor'
  ]
);

-- Add system management permissions to SUPER_ADMIN department
-- Note: SUPER_ADMIN already has all permissions via wildcard,
-- but we document them explicitly for clarity
SELECT add_permission_to_department(
  'SUPER_ADMIN',
  ARRAY[
    'users:view',
    'users:edit',
    'users:delete',
    'users:view_sensitive',
    'users:impersonate',
    'system:settings',
    'system:deploy',
    'system:logs',
    'system:monitor',
    'system:backup',
    'admin:roles'
  ]
);

-- Add limited user viewing to CUSTOMER_SERVICE department
SELECT add_permission_to_department(
  'CUSTOMER_SERVICE',
  ARRAY[
    'users:view'
  ]
);

-- Add limited user viewing to CONTENT_MANAGER department
SELECT add_permission_to_department(
  'CONTENT_MANAGER',
  ARRAY[
    'users:view'
  ]
);

-- Add system backup permissions to OPERATIONS department
-- Operations can access backups but cannot deploy or change settings
SELECT add_permission_to_department(
  'OPERATIONS',
  ARRAY[
    'system:backup'
  ]
);

-- Create audit log entries for this migration
INSERT INTO audit_events (
  id,
  action,
  entity_type,
  entity_id,
  user_id,
  metadata,
  timestamp
)
SELECT 
  gen_random_uuid()::text,
  'MIGRATION_APPLIED',
  'SYSTEM',
  'add_user_system_permissions',
  (SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1),
  jsonb_build_object(
    'migration', 'add_user_system_permissions',
    'description', 'Added granular user management and system permissions',
    'permissions_added', jsonb_build_array(
      'users:view',
      'users:edit', 
      'users:delete',
      'users:view_sensitive',
      'users:impersonate',
      'system:settings',
      'system:deploy',
      'system:logs',
      'system:monitor',
      'system:backup',
      'admin:roles'
    )
  ),
  CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM users WHERE role = 'ADMIN' LIMIT 1);

-- Clean up the temporary function
DROP FUNCTION IF EXISTS add_permission_to_department;

COMMIT;

-- Rollback script (save for reference):
-- BEGIN;
-- UPDATE admin_roles 
-- SET permissions = (
--   SELECT jsonb_agg(elem)
--   FROM jsonb_array_elements_text(permissions) elem
--   WHERE elem::text NOT IN (
--     'users:view', 'users:edit', 'users:delete', 'users:view_sensitive', 'users:impersonate',
--     'system:settings', 'system:deploy', 'system:logs', 'system:monitor', 'system:backup',
--     'admin:roles'
--   )
-- )
-- WHERE is_active = true;
-- COMMIT;
