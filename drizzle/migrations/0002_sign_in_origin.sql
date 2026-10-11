ALTER TABLE "sign_ins" ADD COLUMN "app_kind" text;--> statement-breakpoint
ALTER TABLE "sign_ins" ADD COLUMN "approved_from_id" bigint;--> statement-breakpoint
ALTER TABLE "sign_ins" ADD COLUMN "approval_method" text;--> statement-breakpoint
CREATE INDEX "sign_ins_approved_from_index" ON "sign_ins" USING btree ("approved_from_id");