CREATE TABLE "dpia_assessments" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "dpia_assessments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"tenant_id" bigint DEFAULT nullif(current_setting('app.tenant_id', true), '')::bigint,
	"activity_key" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"threshold" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"risks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"decision" text,
	"signoff" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by" bigint,
	"updated_by" bigint,
	CONSTRAINT "dpia_assessments_owner_key_unique" UNIQUE NULLS NOT DISTINCT("tenant_id","activity_key")
);
--> statement-breakpoint
CREATE TABLE "privacy_incidents" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "privacy_incidents_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"tenant_id" bigint DEFAULT nullif(current_setting('app.tenant_id', true), '')::bigint,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"occurred_at" timestamp with time zone,
	"discovered_at" timestamp with time zone NOT NULL,
	"notice_deadline_at" timestamp with time zone NOT NULL,
	"contained_at" timestamp with time zone,
	"subjects_notified_at" timestamp with time zone,
	"authority_notified_at" timestamp with time zone,
	"public_notified_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"affected_count" integer,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by" bigint,
	CONSTRAINT "privacy_incidents_owner_code_unique" UNIQUE NULLS NOT DISTINCT("tenant_id","code")
);
--> statement-breakpoint
CREATE TABLE "processing_activities" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "processing_activities_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"tenant_id" bigint DEFAULT nullif(current_setting('app.tenant_id', true), '')::bigint,
	"activity_key" text NOT NULL,
	"code" text,
	"status" text DEFAULT 'active' NOT NULL,
	"overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"criteria" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"assignment" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" bigint,
	"updated_by" bigint,
	CONSTRAINT "processing_activities_owner_key_unique" UNIQUE NULLS NOT DISTINCT("tenant_id","activity_key")
);
--> statement-breakpoint
CREATE TABLE "account_consents" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "account_consents_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"tenant_id" bigint,
	"user_id" bigint NOT NULL,
	"policy_version" text NOT NULL,
	"terms_accepted" boolean NOT NULL,
	"marketing" boolean DEFAULT false NOT NULL,
	"source" text NOT NULL,
	"choices" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"withdrawn_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "privacy_requests" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "privacy_requests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"tenant_id" bigint DEFAULT nullif(current_setting('app.tenant_id', true), '')::bigint,
	"code" text NOT NULL,
	"requester_user_id" bigint,
	"requester_name" text NOT NULL,
	"requester_email" text NOT NULL,
	"request_type" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'received' NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"response" text,
	"responded_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"handled_by" bigint,
	"channel" text DEFAULT 'app' NOT NULL
);
--> statement-breakpoint
CREATE INDEX "privacy_incidents_discovered_index" ON "privacy_incidents" USING btree ("tenant_id","discovered_at");--> statement-breakpoint
CREATE INDEX "account_consents_user_index" ON "account_consents" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "privacy_requests_tenant_index" ON "privacy_requests" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "privacy_requests_requester_index" ON "privacy_requests" USING btree ("requester_user_id");--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "processing_activities", "dpia_assessments", "privacy_incidents", "privacy_requests", "account_consents" TO akunmu_app;--> statement-breakpoint
GRANT USAGE, SELECT, UPDATE ON SEQUENCE "processing_activities_id_seq", "dpia_assessments_id_seq", "privacy_incidents_id_seq", "privacy_requests_id_seq", "account_consents_id_seq" TO akunmu_app;--> statement-breakpoint
ALTER TABLE "processing_activities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "processing_activities" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "processing_activities" USING (app_platform() OR "tenant_id" = app_tenant_id()) WITH CHECK (app_platform() OR "tenant_id" = app_tenant_id());--> statement-breakpoint
ALTER TABLE "dpia_assessments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dpia_assessments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "dpia_assessments" USING (app_platform() OR "tenant_id" = app_tenant_id()) WITH CHECK (app_platform() OR "tenant_id" = app_tenant_id());--> statement-breakpoint
ALTER TABLE "privacy_incidents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "privacy_incidents" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "privacy_incidents" USING (app_platform() OR "tenant_id" = app_tenant_id()) WITH CHECK (app_platform() OR "tenant_id" = app_tenant_id());--> statement-breakpoint
ALTER TABLE "privacy_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "privacy_requests" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "privacy_requests" USING (app_platform() OR "tenant_id" = app_tenant_id()) WITH CHECK (app_platform() OR "tenant_id" = app_tenant_id());--> statement-breakpoint
ALTER TABLE "account_consents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "account_consents" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "platform_only" ON "account_consents" USING (app_platform()) WITH CHECK (app_platform());
