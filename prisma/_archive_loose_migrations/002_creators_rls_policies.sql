-- Row Level Security Policies for Creators Table
-- Ensures data access is properly restricted based on user roles and ownership

-- Enable RLS on creators table
ALTER TABLE creators ENABLE ROW LEVEL SECURITY;

-- Policy: Creators can view their own profile
CREATE POLICY creators_select_own
    ON creators
    FOR SELECT
    USING (
        user_id = current_setting('app.current_user_id', true)::TEXT
    );

-- Policy: Public can view approved creator profiles (for discovery/browsing)
CREATE POLICY creators_select_approved_public
    ON creators
    FOR SELECT
    USING (
        verification_status = 'approved' 
        AND deleted_at IS NULL
    );

-- Policy: Admins can view all creator profiles
CREATE POLICY creators_select_admin
    ON creators
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE id = current_setting('app.current_user_id', true)::TEXT
            AND role = 'ADMIN'
        )
    );

-- Policy: Users can create their own creator profile
CREATE POLICY creators_insert_own
    ON creators
    FOR INSERT
    WITH CHECK (
        user_id = current_setting('app.current_user_id', true)::TEXT
    );

-- Policy: Creators can update their own profile
CREATE POLICY creators_update_own
    ON creators
    FOR UPDATE
    USING (
        user_id = current_setting('app.current_user_id', true)::TEXT
    )
    WITH CHECK (
        user_id = current_setting('app.current_user_id', true)::TEXT
        -- Prevent creators from changing their own verification status
        AND (
            verification_status = OLD.verification_status
            OR EXISTS (
                SELECT 1 FROM users
                WHERE id = current_setting('app.current_user_id', true)::TEXT
                AND role = 'ADMIN'
            )
        )
    );

-- Policy: Admins can update any creator profile
CREATE POLICY creators_update_admin
    ON creators
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE id = current_setting('app.current_user_id', true)::TEXT
            AND role = 'ADMIN'
        )
    );

-- Policy: Creators can soft-delete their own profile
CREATE POLICY creators_delete_own
    ON creators
    FOR UPDATE
    USING (
        user_id = current_setting('app.current_user_id', true)::TEXT
    )
    WITH CHECK (
        user_id = current_setting('app.current_user_id', true)::TEXT
        AND deleted_at IS NOT NULL
    );

-- Policy: Admins can delete any creator profile
CREATE POLICY creators_delete_admin
    ON creators
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE id = current_setting('app.current_user_id', true)::TEXT
            AND role = 'ADMIN'
        )
    );

-- Function to set current user context (called by application before queries)
CREATE OR REPLACE FUNCTION set_current_user(user_id TEXT)
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_user_id', user_id, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to application role
-- GRANT EXECUTE ON FUNCTION set_current_user(TEXT) TO application_role;

COMMENT ON POLICY creators_select_own ON creators IS 'Allow creators to view their own profile';
COMMENT ON POLICY creators_select_approved_public ON creators IS 'Allow public to view approved creator profiles';
COMMENT ON POLICY creators_select_admin ON creators IS 'Allow admins to view all creator profiles';
COMMENT ON POLICY creators_insert_own ON creators IS 'Allow users to create their own creator profile';
COMMENT ON POLICY creators_update_own ON creators IS 'Allow creators to update their own profile (except verification status)';
COMMENT ON POLICY creators_update_admin ON creators IS 'Allow admins to update any creator profile';
COMMENT ON POLICY creators_delete_own ON creators IS 'Allow creators to soft-delete their own profile';
COMMENT ON POLICY creators_delete_admin ON creators IS 'Allow admins to delete any creator profile';
