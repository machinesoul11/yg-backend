-- =====================================================
-- Row-Level Security (RLS) Policies
-- =====================================================
-- These policies enforce data access controls at the database level
-- Implements role-based access control for multi-tenant data isolation

-- =====================================================
-- Enable RLS on Tables
-- =====================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE talents ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE intellectual_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE royalties ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- Helper Function: Get Current User Role
-- =====================================================

CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT role::text FROM users WHERE id = current_setting('app.current_user_id', TRUE)::text;
$$;

-- =====================================================
-- Users Table Policies
-- =====================================================

-- Admins can see all users
CREATE POLICY users_admin_all ON users
  FOR ALL
  TO authenticated
  USING (get_current_user_role() = 'ADMIN');

-- Users can see their own data
CREATE POLICY users_self_select ON users
  FOR SELECT
  TO authenticated
  USING (id = current_setting('app.current_user_id', TRUE)::text);

-- Users can update their own profile
CREATE POLICY users_self_update ON users
  FOR UPDATE
  TO authenticated
  USING (id = current_setting('app.current_user_id', TRUE)::text);

-- =====================================================
-- Talents Table Policies
-- =====================================================

-- Admins can manage all talents
CREATE POLICY talents_admin_all ON talents
  FOR ALL
  TO authenticated
  USING (get_current_user_role() = 'ADMIN');

-- Talents can see all verified talents (discovery)
CREATE POLICY talents_public_select ON talents
  FOR SELECT
  TO authenticated
  USING (is_verified = TRUE OR user_id = current_setting('app.current_user_id', TRUE)::text);

-- Talents can update their own profile
CREATE POLICY talents_self_update ON talents
  FOR UPDATE
  TO authenticated
  USING (user_id = current_setting('app.current_user_id', TRUE)::text);

-- =====================================================
-- Brands Table Policies
-- =====================================================

-- Admins can manage all brands
CREATE POLICY brands_admin_all ON brands
  FOR ALL
  TO authenticated
  USING (get_current_user_role() = 'ADMIN');

-- Brands can see verified brands
CREATE POLICY brands_public_select ON brands
  FOR SELECT
  TO authenticated
  USING (is_verified = TRUE OR user_id = current_setting('app.current_user_id', TRUE)::text);

-- Brands can update their own profile
CREATE POLICY brands_self_update ON brands
  FOR UPDATE
  TO authenticated
  USING (user_id = current_setting('app.current_user_id', TRUE)::text);

-- =====================================================
-- Intellectual Property Policies
-- =====================================================

-- Admins can manage all IP
CREATE POLICY ip_admin_all ON intellectual_properties
  FOR ALL
  TO authenticated
  USING (get_current_user_role() = 'ADMIN');

-- Talents can manage their own IP
CREATE POLICY ip_talent_all ON intellectual_properties
  FOR ALL
  TO authenticated
  USING (
    talent_id IN (
      SELECT id FROM talents WHERE user_id = current_setting('app.current_user_id', TRUE)::text
    )
  );

-- Brands can see active IP (for licensing)
CREATE POLICY ip_brands_select ON intellectual_properties
  FOR SELECT
  TO authenticated
  USING (
    is_active = TRUE 
    AND get_current_user_role() IN ('BRAND', 'ADMIN')
  );

-- =====================================================
-- Licenses Policies
-- =====================================================

-- Admins can manage all licenses
CREATE POLICY licenses_admin_all ON licenses
  FOR ALL
  TO authenticated
  USING (get_current_user_role() = 'ADMIN');

-- Talents can see their licenses
CREATE POLICY licenses_talent_select ON licenses
  FOR SELECT
  TO authenticated
  USING (
    talent_id IN (
      SELECT id FROM talents WHERE user_id = current_setting('app.current_user_id', TRUE)::text
    )
  );

-- Brands can manage their licenses
CREATE POLICY licenses_brand_all ON licenses
  FOR ALL
  TO authenticated
  USING (
    brand_id IN (
      SELECT id FROM brands WHERE user_id = current_setting('app.current_user_id', TRUE)::text
    )
  );

-- =====================================================
-- Royalties Policies
-- =====================================================

-- Admins can manage all royalties
CREATE POLICY royalties_admin_all ON royalties
  FOR ALL
  TO authenticated
  USING (get_current_user_role() = 'ADMIN');

-- Talents can see their royalties
CREATE POLICY royalties_talent_select ON royalties
  FOR SELECT
  TO authenticated
  USING (
    talent_id IN (
      SELECT id FROM talents WHERE user_id = current_setting('app.current_user_id', TRUE)::text
    )
  );

-- Talents can dispute their royalties
CREATE POLICY royalties_talent_update ON royalties
  FOR UPDATE
  TO authenticated
  USING (
    talent_id IN (
      SELECT id FROM talents WHERE user_id = current_setting('app.current_user_id', TRUE)::text
    )
    AND status = 'PENDING'
  );

-- =====================================================
-- Payments Policies
-- =====================================================

-- Admins can manage all payments
CREATE POLICY payments_admin_all ON payments
  FOR ALL
  TO authenticated
  USING (get_current_user_role() = 'ADMIN');

-- Brands can see their payments
CREATE POLICY payments_brand_select ON payments
  FOR SELECT
  TO authenticated
  USING (
    brand_id IN (
      SELECT id FROM brands WHERE user_id = current_setting('app.current_user_id', TRUE)::text
    )
  );

-- Brands can create payments
CREATE POLICY payments_brand_insert ON payments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    brand_id IN (
      SELECT id FROM brands WHERE user_id = current_setting('app.current_user_id', TRUE)::text
    )
  );

-- =====================================================
-- Usage in Application
-- =====================================================

-- Before each request, set the current user context:
-- 
-- await prisma.$executeRaw`SELECT set_config('app.current_user_id', ${userId}, TRUE)`;
-- 
-- Then all subsequent queries will be filtered by RLS policies
-- 
-- Example:
-- const licenses = await prisma.license.findMany();
-- // Automatically filtered to show only licenses the user can access

-- =====================================================
-- Testing RLS Policies
-- =====================================================

-- Test as admin:
-- SELECT set_config('app.current_user_id', '[admin-user-id]', FALSE);
-- SELECT * FROM licenses; -- Should see all licenses

-- Test as talent:
-- SELECT set_config('app.current_user_id', '[talent-user-id]', FALSE);
-- SELECT * FROM licenses; -- Should see only own licenses

-- Test as brand:
-- SELECT set_config('app.current_user_id', '[brand-user-id]', FALSE);
-- SELECT * FROM licenses; -- Should see only own licenses

-- =====================================================
-- Notes
-- =====================================================

-- 1. RLS provides defense-in-depth security
--    (Even if application code has bugs, database enforces access control)

-- 2. Session variables are used to identify the current user
--    (Set via `set_config('app.current_user_id', ...)`)

-- 3. Policies are additive (OR logic)
--    (Multiple policies apply for different access patterns)

-- 4. Performance considerations:
--    - RLS policies are evaluated for every query
--    - Keep policies simple and indexed
--    - Use partial indexes on filtered columns

-- 5. Disable RLS for batch operations:
--    - Use a service role with RLS bypassed
--    - Or temporarily disable: ALTER TABLE ... DISABLE ROW LEVEL SECURITY
