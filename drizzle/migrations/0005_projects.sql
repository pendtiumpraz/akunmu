CREATE TABLE "project_sessions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "project_sessions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"tenant_id" bigint DEFAULT nullif(current_setting('app.tenant_id', true), '')::bigint NOT NULL,
	"project_id" bigint NOT NULL,
	"sign_in_id" bigint NOT NULL,
	"created_by" bigint
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "projects_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"tenant_id" bigint DEFAULT nullif(current_setting('app.tenant_id', true), '')::bigint NOT NULL,
	"name" text NOT NULL,
	"url" text,
	"notes" text,
	"screenshot_url" text,
	"screenshot_path" text,
	"screenshot_at" timestamp with time zone,
	"created_by" bigint
);
--> statement-breakpoint
CREATE INDEX "project_sessions_sign_in_index" ON "project_sessions" USING btree ("sign_in_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_sessions_unique" ON "project_sessions" USING btree ("project_id","sign_in_id");--> statement-breakpoint
CREATE INDEX "projects_tenant_name_index" ON "projects" USING btree ("tenant_id","name");--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "projects", "project_sessions" TO akunmu_app;--> statement-breakpoint
GRANT USAGE, SELECT, UPDATE ON SEQUENCE "projects_id_seq", "project_sessions_id_seq" TO akunmu_app;--> statement-breakpoint
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "projects" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "projects" USING (app_platform() OR "tenant_id" = app_tenant_id()) WITH CHECK (app_platform() OR "tenant_id" = app_tenant_id());--> statement-breakpoint
ALTER TABLE "project_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_sessions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "project_sessions" USING (app_platform() OR "tenant_id" = app_tenant_id()) WITH CHECK (app_platform() OR "tenant_id" = app_tenant_id());
