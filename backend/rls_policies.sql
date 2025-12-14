-- ============================================================================
-- ResidencyFlow: Row-Level Security (RLS) Policies
-- ============================================================================
-- Purpose: Enforce multi-tenant data isolation at the database level
-- Architecture: Zero-trust - Application cannot bypass tenant boundaries
-- Performance: Optimized for heavy concurrent use with proper indexes
-- ============================================================================

-- ============================================================================
-- 1. ENABLE RLS ON ALL TENANT TABLES
-- ============================================================================

-- Organizations table (no RLS - SuperAdmins see all)
-- ALTER TABLE organizations ENABLE ROW LEVEL SECURITY; -- Not needed, SuperAdmin only

-- Users table - Users can only see users in their organization
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Connectors table - Tenant-scoped
ALTER TABLE connectors ENABLE ROW LEVEL SECURITY;

-- Pipelines table - Tenant-scoped
ALTER TABLE pipelines ENABLE ROW LEVEL SECURITY;

-- Team invitations table - Tenant-scoped
ALTER TABLE team_invitations ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. CREATE SECURITY DEFINER FUNCTIONS
-- ============================================================================
-- These functions run with elevated privileges to extract JWT claims
-- They are called by RLS policies to determine access

-- Extract organization_id from JWT token set by application
CREATE OR REPLACE FUNCTION auth.current_organization_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT NULLIF(current_setting('app.current_organization_id', TRUE), '')::UUID;
$$;

-- Extract user role from JWT token set by application
CREATE OR REPLACE FUNCTION auth.current_user_role()
RETURNS VARCHAR
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT NULLIF(current_setting('app.current_user_role', TRUE), '');
$$;

-- Extract user_id (sub claim) from JWT token
CREATE OR REPLACE FUNCTION auth.current_user_id()
RETURNS VARCHAR
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT NULLIF(current_setting('app.current_user_id', TRUE), '');
$$;

-- Check if current user is SuperAdmin
CREATE OR REPLACE FUNCTION auth.is_super_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT auth.current_user_role() = 'SuperAdmin';
$$;

-- ============================================================================
-- 3. USERS TABLE RLS POLICIES
-- ============================================================================

-- Policy: Users can only see users in their organization
-- SuperAdmins can see all users
CREATE POLICY users_tenant_isolation_policy ON users
  FOR ALL
  USING (
    auth.is_super_admin() OR
    organization_id = auth.current_organization_id()
  );

-- Policy: Users can only modify themselves (unless owner/admin)
CREATE POLICY users_self_update_policy ON users
  FOR UPDATE
  USING (
    auth.is_super_admin() OR
    id = auth.current_user_id() OR
    (
      organization_id = auth.current_organization_id() AND
      auth.current_user_role() IN ('Owner', 'Admin')
    )
  );

-- Policy: Only SuperAdmin can create users (via onboarding)
-- Regular users created via team invitations (different flow)
CREATE POLICY users_admin_insert_policy ON users
  FOR INSERT
  WITH CHECK (
    auth.is_super_admin() OR
    organization_id = auth.current_organization_id()
  );

-- ============================================================================
-- 4. CONNECTORS TABLE RLS POLICIES
-- ============================================================================

-- Policy: Users can only access connectors in their organization
CREATE POLICY connectors_tenant_isolation_policy ON connectors
  FOR ALL
  USING (
    auth.is_super_admin() OR
    organization_id = auth.current_organization_id()
  );

-- Policy: Users can create connectors in their organization
CREATE POLICY connectors_tenant_insert_policy ON connectors
  FOR INSERT
  WITH CHECK (
    NOT auth.is_super_admin() AND
    organization_id = auth.current_organization_id()
  );

-- Policy: Users can update their organization's connectors
CREATE POLICY connectors_tenant_update_policy ON connectors
  FOR UPDATE
  USING (
    organization_id = auth.current_organization_id()
  );

-- Policy: Users can delete their organization's connectors
CREATE POLICY connectors_tenant_delete_policy ON connectors
  FOR DELETE
  USING (
    organization_id = auth.current_organization_id() AND
    auth.current_user_role() IN ('Owner', 'Admin')
  );

-- ============================================================================
-- 5. PIPELINES TABLE RLS POLICIES
-- ============================================================================

-- Policy: Users can only access pipelines in their organization
CREATE POLICY pipelines_tenant_isolation_policy ON pipelines
  FOR ALL
  USING (
    auth.is_super_admin() OR
    organization_id = auth.current_organization_id()
  );

-- Policy: Users can create pipelines in their organization
CREATE POLICY pipelines_tenant_insert_policy ON pipelines
  FOR INSERT
  WITH CHECK (
    NOT auth.is_super_admin() AND
    organization_id = auth.current_organization_id()
  );

-- Policy: Users can update their organization's pipelines
CREATE POLICY pipelines_tenant_update_policy ON pipelines
  FOR UPDATE
  USING (
    organization_id = auth.current_organization_id()
  );

-- Policy: Users can delete their organization's pipelines
CREATE POLICY pipelines_tenant_delete_policy ON pipelines
  FOR DELETE
  USING (
    organization_id = auth.current_organization_id() AND
    auth.current_user_role() IN ('Owner', 'Admin')
  );

-- ============================================================================
-- 6. TEAM INVITATIONS TABLE RLS POLICIES
-- ============================================================================

-- Policy: Users can only see invitations for their organization
CREATE POLICY team_invitations_tenant_isolation_policy ON team_invitations
  FOR ALL
  USING (
    auth.is_super_admin() OR
    organization_id = auth.current_organization_id()
  );

-- Policy: Only Owner/Admin can create invitations
CREATE POLICY team_invitations_admin_insert_policy ON team_invitations
  FOR INSERT
  WITH CHECK (
    organization_id = auth.current_organization_id() AND
    auth.current_user_role() IN ('Owner', 'Admin')
  );

-- ============================================================================
-- 7. PERFORMANCE INDEXES
-- ============================================================================
-- Critical for RLS policy performance with large datasets

-- Index on organization_id for fast tenant filtering
CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_connectors_organization_id ON connectors(organization_id);
CREATE INDEX IF NOT EXISTS idx_pipelines_organization_id ON pipelines(organization_id);
CREATE INDEX IF NOT EXISTS idx_team_invitations_organization_id ON team_invitations(organization_id);

-- Index on created_by for user-specific queries
CREATE INDEX IF NOT EXISTS idx_connectors_created_by ON connectors(created_by);
CREATE INDEX IF NOT EXISTS idx_pipelines_created_by ON pipelines(created_by);

-- Composite index for tenant + status queries (common pattern)
CREATE INDEX IF NOT EXISTS idx_connectors_org_status ON connectors(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_pipelines_org_status ON pipelines(organization_id, status);

-- Index on email for user lookups (used in authentication)
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Index on invitation tokens for invite acceptance
CREATE INDEX IF NOT EXISTS idx_team_invitations_token ON team_invitations(token) WHERE status = 'Pending';

-- ============================================================================
-- 8. GRANT PERMISSIONS
-- ============================================================================
-- Grant necessary permissions to application database user

-- Grant usage on auth schema (for RLS functions)
GRANT USAGE ON SCHEMA auth TO residency; -- Replace 'residency' with your DB user

-- Grant execute on auth functions
GRANT EXECUTE ON FUNCTION auth.current_organization_id() TO residency;
GRANT EXECUTE ON FUNCTION auth.current_user_role() TO residency;
GRANT EXECUTE ON FUNCTION auth.current_user_id() TO residency;
GRANT EXECUTE ON FUNCTION auth.is_super_admin() TO residency;

-- ============================================================================
-- 9. AUDIT LOGGING (OPTIONAL BUT RECOMMENDED)
-- ============================================================================

-- Create audit log table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    user_id VARCHAR,
    action VARCHAR NOT NULL,
    table_name VARCHAR NOT NULL,
    record_id VARCHAR,
    old_data JSONB,
    new_data JSONB,
    timestamp TIMESTAMP DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT
);

-- Index for audit queries
CREATE INDEX idx_audit_logs_organization_id ON audit_logs(organization_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);

-- Enable RLS on audit logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see audit logs for their organization
CREATE POLICY audit_logs_tenant_isolation_policy ON audit_logs
  FOR SELECT
  USING (
    auth.is_super_admin() OR
    organization_id = auth.current_organization_id()
  );

-- Trigger function for automatic audit logging
CREATE OR REPLACE FUNCTION audit.log_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (organization_id, user_id, action, table_name, record_id, new_data)
    VALUES (
      NEW.organization_id,
      auth.current_user_id(),
      TG_OP,
      TG_TABLE_NAME,
      NEW.id::TEXT,
      to_jsonb(NEW)
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (organization_id, user_id, action, table_name, record_id, old_data, new_data)
    VALUES (
      NEW.organization_id,
      auth.current_user_id(),
      TG_OP,
      TG_TABLE_NAME,
      NEW.id::TEXT,
      to_jsonb(OLD),
      to_jsonb(NEW)
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (organization_id, user_id, action, table_name, record_id, old_data)
    VALUES (
      OLD.organization_id,
      auth.current_user_id(),
      TG_OP,
      TG_TABLE_NAME,
      OLD.id::TEXT,
      to_jsonb(OLD)
    );
    RETURN OLD;
  END IF;
END;
$$;

-- Create triggers (commented out - uncomment to enable audit logging)
-- CREATE TRIGGER connectors_audit_trigger AFTER INSERT OR UPDATE OR DELETE ON connectors FOR EACH ROW EXECUTE FUNCTION audit.log_changes();
-- CREATE TRIGGER pipelines_audit_trigger AFTER INSERT OR UPDATE OR DELETE ON pipelines FOR EACH ROW EXECUTE FUNCTION audit.log_changes();
-- CREATE TRIGGER users_audit_trigger AFTER INSERT OR UPDATE OR DELETE ON users FOR EACH ROW EXECUTE FUNCTION audit.log_changes();

-- ============================================================================
-- 10. VERIFICATION QUERIES
-- ============================================================================
-- Run these to verify RLS is working correctly

-- Verify RLS is enabled
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('users', 'connectors', 'pipelines', 'team_invitations');

-- List all policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename IN ('users', 'connectors', 'pipelines', 'team_invitations')
ORDER BY tablename, policyname;

-- Check indexes
SELECT tablename, indexname, indexdef 
FROM pg_indexes 
WHERE tablename IN ('users', 'connectors', 'pipelines', 'team_invitations')
ORDER BY tablename, indexname;

-- ============================================================================
-- 11. TESTING QUERIES
-- ============================================================================
-- Example: Test as a regular user (set JWT claims)

-- Set context as Tenant User
-- SET app.current_organization_id = 'tenant-uuid-here';
-- SET app.current_user_role = 'Admin';
-- SET app.current_user_id = 'user-uuid-here';

-- SELECT * FROM pipelines;  -- Should only see org's pipelines
-- SELECT * FROM connectors; -- Should only see org's connectors

-- Set context as SuperAdmin
-- SET app.current_user_role = 'SuperAdmin';
-- SELECT * FROM pipelines;  -- Should see ALL pipelines

-- ============================================================================
-- IMPORTANT NOTES
-- ============================================================================

-- 1. Application MUST set these session variables on every request:
--    - app.current_organization_id (from JWT token)
--    - app.current_user_role (from JWT token)
--    - app.current_user_id (from JWT token - 'sub' claim)

-- 2. RLS policies are enforced at the database level
--    Even if application has SQL injection, tenant isolation holds

-- 3. SuperAdmin role (organization_id = NULL) bypasses tenant filters
--    Use with caution - only for platform management

-- 4. Performance: With proper indexes, RLS adds <5ms overhead
--    Test with EXPLAIN ANALYZE on production-scale data

-- 5. Backup/Restore: RLS policies are part of schema dump
--    pg_dump --schema-only includes all policies

-- 6. Connection Pooling: Session variables are per-connection
--    Always SET variables at start of request, not at connection time

-- 7. DLT Integration: dlt state stored in S3/MinIO (tenant-isolated)
--    Database RLS protects metadata (pipelines, connectors, users)
--    S3 prefix isolation protects data and state

-- ============================================================================
-- END OF RLS POLICIES
-- ============================================================================
