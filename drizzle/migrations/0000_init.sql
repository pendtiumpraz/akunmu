CREATE TABLE "accounts" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "accounts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"tenant_id" bigint DEFAULT nullif(current_setting('app.tenant_id', true), '')::bigint NOT NULL,
	"provider_id" bigint NOT NULL,
	"identifier" text NOT NULL,
	"label" text,
	"two_factor" text DEFAULT 'unknown' NOT NULL,
	"notes" text,
	"created_by" bigint
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "providers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"tenant_id" bigint DEFAULT nullif(current_setting('app.tenant_id', true), '')::bigint NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"color" text DEFAULT '#64748b' NOT NULL,
	"built_in" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_actions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ai_actions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"tenant_id" bigint DEFAULT nullif(current_setting('app.tenant_id', true), '')::bigint NOT NULL,
	"conversation_id" bigint NOT NULL,
	"message_id" bigint NOT NULL,
	"call_id" text NOT NULL,
	"tool" text NOT NULL,
	"input" jsonb NOT NULL,
	"preview" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"result" jsonb,
	"decided_by" bigint,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_conversations" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ai_conversations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"tenant_id" bigint DEFAULT nullif(current_setting('app.tenant_id', true), '')::bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"model" text,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"running_since" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_messages" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ai_messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"tenant_id" bigint DEFAULT nullif(current_setting('app.tenant_id', true), '')::bigint NOT NULL,
	"conversation_id" bigint NOT NULL,
	"role" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"tool_calls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model" text,
	"provider_state" jsonb
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ai_usage_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"tenant_id" bigint DEFAULT nullif(current_setting('app.tenant_id', true), '')::bigint NOT NULL,
	"period" text NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_usage_tenant_period_unique" UNIQUE("tenant_id","period")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"tenant_id" bigint DEFAULT nullif(current_setting('app.tenant_id', true), '')::bigint,
	"actor_type" text NOT NULL,
	"actor_id" bigint,
	"action" text NOT NULL,
	"subject_type" text,
	"subject_id" bigint,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "browser_profiles" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "browser_profiles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"tenant_id" bigint DEFAULT nullif(current_setting('app.tenant_id', true), '')::bigint NOT NULL,
	"device_id" bigint NOT NULL,
	"browser" text DEFAULT 'chrome' NOT NULL,
	"name" text NOT NULL,
	"sync_account_id" bigint,
	"color" text,
	"notes" text,
	"created_by" bigint
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "devices_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"tenant_id" bigint DEFAULT nullif(current_setting('app.tenant_id', true), '')::bigint NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'laptop' NOT NULL,
	"system" text DEFAULT 'other' NOT NULL,
	"location" text,
	"notes" text,
	"last_checked_at" timestamp with time zone,
	"created_by" bigint
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "rate_limits_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"key" text NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "app_settings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"tenant_id" bigint DEFAULT nullif(current_setting('app.tenant_id', true), '')::bigint,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"is_secret" boolean DEFAULT false NOT NULL,
	CONSTRAINT "app_settings_tenant_key_unique" UNIQUE NULLS NOT DISTINCT("tenant_id","key")
);
--> statement-breakpoint
CREATE TABLE "sign_ins" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sign_ins_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"tenant_id" bigint DEFAULT nullif(current_setting('app.tenant_id', true), '')::bigint NOT NULL,
	"account_id" bigint NOT NULL,
	"device_id" bigint NOT NULL,
	"profile_id" bigint,
	"app" text,
	"status" text DEFAULT 'signed_in' NOT NULL,
	"since" text,
	"last_verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"signed_out_at" timestamp with time zone,
	"review" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_by" bigint
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tenants_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"contact_email" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"locale" text,
	"created_by" bigint
);
--> statement-breakpoint
CREATE TABLE "staff_sessions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "staff_sessions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"user_id" bigint NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"tenant_id" bigint DEFAULT nullif(current_setting('app.tenant_id', true), '')::bigint,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'editor' NOT NULL,
	"locale" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_provider_identifier_unique" ON "accounts" USING btree ("provider_id",lower("identifier")) WHERE "accounts"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "accounts_tenant_identifier_index" ON "accounts" USING btree ("tenant_id",lower("identifier"));--> statement-breakpoint
CREATE UNIQUE INDEX "providers_tenant_slug_unique" ON "providers" USING btree ("tenant_id","slug") WHERE "providers"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ai_actions_conversation_index" ON "ai_actions" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "ai_actions_message_index" ON "ai_actions" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "ai_conversations_user_index" ON "ai_conversations" USING btree ("tenant_id","user_id","last_message_at");--> statement-breakpoint
CREATE INDEX "ai_messages_conversation_index" ON "ai_messages" USING btree ("conversation_id","id");--> statement-breakpoint
CREATE INDEX "audit_logs_subject_index" ON "audit_logs" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "audit_logs_tenant_created_index" ON "audit_logs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "browser_profiles_device_index" ON "browser_profiles" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "devices_tenant_name_index" ON "devices" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "rate_limits_key_unique" ON "rate_limits" USING btree ("key");--> statement-breakpoint
CREATE INDEX "sign_ins_account_index" ON "sign_ins" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "sign_ins_device_index" ON "sign_ins" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "sign_ins_profile_index" ON "sign_ins" USING btree ("profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sign_ins_active_place_unique" ON "sign_ins" USING btree ("account_id","device_id",coalesce("profile_id", 0),lower(coalesce("app", ''))) WHERE "sign_ins"."deleted_at" is null and "sign_ins"."status" = 'signed_in';--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_slug_active_unique" ON "tenants" USING btree ("slug") WHERE "tenants"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_sessions_token_hash_unique" ON "staff_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "staff_sessions_user_id_index" ON "staff_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_active_unique" ON "users" USING btree (lower("email")) WHERE "users"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "users_tenant_id_index" ON "users" USING btree ("tenant_id");