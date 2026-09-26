ALTER TABLE "conventions" ADD COLUMN IF NOT EXISTS "evidence_line" integer;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN IF NOT EXISTS "category" text DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN IF NOT EXISTS "accepted" boolean DEFAULT false NOT NULL;
