DROP INDEX IF EXISTS "eval_suite_runs_agent_running_uq";--> statement-breakpoint
ALTER TABLE "eval_suite_runs" ADD COLUMN IF NOT EXISTS "owner_kind" text DEFAULT 'agent' NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_suite_runs" ADD COLUMN IF NOT EXISTS "skill_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_suite_runs" ADD COLUMN IF NOT EXISTS "skill_version" integer;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "eval_suite_runs_skill_ran_at_idx" ON "eval_suite_runs" USING btree ("skill_id","ran_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "eval_suite_runs_agent_owner_running_uq" ON "eval_suite_runs" USING btree ("agent_id") WHERE "eval_suite_runs"."status" = 'running' AND "eval_suite_runs"."owner_kind" = 'agent';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "eval_suite_runs_skill_running_uq" ON "eval_suite_runs" USING btree ("skill_id") WHERE "eval_suite_runs"."status" = 'running' AND "eval_suite_runs"."owner_kind" = 'skill';--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "eval_suite_runs" ADD CONSTRAINT "eval_suite_runs_owner_kind_check" CHECK ("eval_suite_runs"."owner_kind" IN ('agent','skill'));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "eval_suite_runs" ADD CONSTRAINT "eval_suite_runs_owner_shape_check" CHECK (("eval_suite_runs"."owner_kind" = 'agent' AND "eval_suite_runs"."skill_id" IS NULL AND "eval_suite_runs"."skill_version" IS NULL) OR ("eval_suite_runs"."owner_kind" = 'skill' AND "eval_suite_runs"."skill_id" IS NOT NULL AND "eval_suite_runs"."skill_version" IS NOT NULL));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
