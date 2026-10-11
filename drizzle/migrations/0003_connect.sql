CREATE TABLE "findings" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "findings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"tenant_id" bigint DEFAULT nullif(current_setting('app.tenant_id', true), '')::bigint NOT NULL,
	"device_id" bigint,
	"token_id" bigint,
	"kind" text NOT NULL,
	"fingerprint" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" bigint
);
--> statement-breakpoint
CREATE TABLE "ingest_tokens" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ingest_tokens_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"tenant_id" bigint DEFAULT nullif(current_setting('app.tenant_id', true), '')::bigint NOT NULL,
	"device_id" bigint NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"hint" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"last_report" jsonb,
	"revoked_at" timestamp with time zone,
	"created_by" bigint
);
--> statement-breakpoint
ALTER TABLE "browser_profiles" ADD COLUMN "directory" text;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "hostname" text;--> statement-breakpoint
CREATE UNIQUE INDEX "findings_tenant_fingerprint_unique" ON "findings" USING btree ("tenant_id","fingerprint");--> statement-breakpoint
CREATE INDEX "findings_tenant_status_index" ON "findings" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "ingest_tokens_hash_unique" ON "ingest_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "ingest_tokens_tenant_index" ON "ingest_tokens" USING btree ("tenant_id");--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "findings", "ingest_tokens" TO akunmu_app;--> statement-breakpoint
GRANT USAGE, SELECT, UPDATE ON SEQUENCE "findings_id_seq", "ingest_tokens_id_seq" TO akunmu_app;--> statement-breakpoint
ALTER TABLE "findings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "findings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "findings" USING (app_platform() OR "tenant_id" = app_tenant_id()) WITH CHECK (app_platform() OR "tenant_id" = app_tenant_id());--> statement-breakpoint
ALTER TABLE "ingest_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ingest_tokens" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "ingest_tokens" USING (app_platform() OR "tenant_id" = app_tenant_id()) WITH CHECK (app_platform() OR "tenant_id" = app_tenant_id());
