ALTER TABLE "videos" ADD COLUMN "thumbnail_error_message" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "seeking_preview_error_message" text;--> statement-breakpoint
ALTER TABLE "videos" DROP COLUMN "error_message";