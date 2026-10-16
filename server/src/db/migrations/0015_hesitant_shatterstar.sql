CREATE TABLE IF NOT EXISTS "eval_suite_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"agent_version" integer NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"case_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cases_total" integer DEFAULT 0 NOT NULL,
	"cases_completed" integer DEFAULT 0 NOT NULL,
	"cases_passed" integer DEFAULT 0 NOT NULL,
	"cases_errored" integer DEFAULT 0 NOT NULL,
	"recall" double precision,
	"precision" double precision,
	"citation_accuracy" double precision,
	"cost_usd" double precision,
	"duration_ms" integer,
	"error" text,
	CONSTRAINT "eval_suite_runs_status_check" CHECK ("eval_suite_runs"."status" IN ('running','done','partial','failed'))
);
--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN IF NOT EXISTS "suite_run_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "eval_suite_runs" ADD CONSTRAINT "eval_suite_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "eval_suite_runs_agent_ran_at_idx" ON "eval_suite_runs" USING btree ("agent_id","ran_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "eval_suite_runs_workspace_id_idx" ON "eval_suite_runs" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "eval_suite_runs_agent_running_uq" ON "eval_suite_runs" USING btree ("agent_id") WHERE "eval_suite_runs"."status" = 'running';--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_suite_run_id_eval_suite_runs_id_fk" FOREIGN KEY ("suite_run_id") REFERENCES "public"."eval_suite_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "eval_runs_suite_run_id_idx" ON "eval_runs" USING btree ("suite_run_id");
