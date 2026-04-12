ALTER TABLE "videos" ADD COLUMN "hls_path" varchar(512);--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "hls_error_message" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "hls_variants" text;