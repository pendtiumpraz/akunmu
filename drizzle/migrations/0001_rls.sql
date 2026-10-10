-- Row level security (workspace isolation).
-- The app runs every statement in a short transaction that switches to the role akunmu_app (which cannot
-- bypass RLS) and sets app.tenant_id / app.platform (src/shared/db/scope.ts). Workspace-owned rows are visible
-- only to their workspace; the platform scope (owner console, sign-in lookups, scripts) sees every workspace.
-- FORCE makes the policies apply to the table owner as well. rate_limits has no owner and stays unrestricted.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'akunmu_app') THEN
    CREATE ROLE akunmu_app NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint
GRANT akunmu_app TO CURRENT_USER;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO akunmu_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO akunmu_app;
--> statement-breakpoint
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO akunmu_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO akunmu_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO akunmu_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_tenant_id() RETURNS bigint LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.tenant_id', true), '')::bigint $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_platform() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('app.platform', true), '') = 'on' $$;
--> statement-breakpoint
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenants" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "tenants" USING (app_platform() OR "id" = app_tenant_id()) WITH CHECK (app_platform() OR "id" = app_tenant_id());--> statement-breakpoint
ALTER TABLE "staff_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "staff_sessions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "platform_only" ON "staff_sessions" USING (app_platform()) WITH CHECK (app_platform());--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "users" USING (app_platform() OR "tenant_id" = app_tenant_id()) WITH CHECK (app_platform() OR "tenant_id" = app_tenant_id());--> statement-breakpoint
ALTER TABLE "devices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "devices" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "devices" USING (app_platform() OR "tenant_id" = app_tenant_id()) WITH CHECK (app_platform() OR "tenant_id" = app_tenant_id());--> statement-breakpoint
ALTER TABLE "browser_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "browser_profiles" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "browser_profiles" USING (app_platform() OR "tenant_id" = app_tenant_id()) WITH CHECK (app_platform() OR "tenant_id" = app_tenant_id());--> statement-breakpoint
ALTER TABLE "providers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "providers" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "providers" USING (app_platform() OR "tenant_id" = app_tenant_id()) WITH CHECK (app_platform() OR "tenant_id" = app_tenant_id());--> statement-breakpoint
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "accounts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "accounts" USING (app_platform() OR "tenant_id" = app_tenant_id()) WITH CHECK (app_platform() OR "tenant_id" = app_tenant_id());--> statement-breakpoint
ALTER TABLE "sign_ins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sign_ins" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "sign_ins" USING (app_platform() OR "tenant_id" = app_tenant_id()) WITH CHECK (app_platform() OR "tenant_id" = app_tenant_id());--> statement-breakpoint
ALTER TABLE "app_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app_settings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app_settings" USING (app_platform() OR "tenant_id" = app_tenant_id()) WITH CHECK (app_platform() OR "tenant_id" = app_tenant_id());--> statement-breakpoint
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "audit_logs" USING (app_platform() OR "tenant_id" = app_tenant_id()) WITH CHECK (app_platform() OR "tenant_id" = app_tenant_id());--> statement-breakpoint
ALTER TABLE "ai_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_usage" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "ai_usage" USING (app_platform() OR "tenant_id" = app_tenant_id()) WITH CHECK (app_platform() OR "tenant_id" = app_tenant_id());--> statement-breakpoint
ALTER TABLE "ai_conversations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_conversations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "ai_conversations" USING (app_platform() OR "tenant_id" = app_tenant_id()) WITH CHECK (app_platform() OR "tenant_id" = app_tenant_id());--> statement-breakpoint
ALTER TABLE "ai_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_messages" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "ai_messages" USING (app_platform() OR "tenant_id" = app_tenant_id()) WITH CHECK (app_platform() OR "tenant_id" = app_tenant_id());--> statement-breakpoint
ALTER TABLE "ai_actions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_actions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "ai_actions" USING (app_platform() OR "tenant_id" = app_tenant_id()) WITH CHECK (app_platform() OR "tenant_id" = app_tenant_id());
