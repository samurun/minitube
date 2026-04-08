import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  integer,
} from "drizzle-orm/pg-core"

export const videos = pgTable("videos", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  rawPath: varchar("raw_path", { length: 512 }).notNull(),
  thumbnailPath: varchar("thumbnail_path", { length: 512 }),
  thumbnailErrorMessage: text("thumbnail_error_message"),
  seekingPreviewPath: varchar("seeking_preview_path", { length: 512 }),
  seekingPreviewErrorMessage: text("seeking_preview_error_message"),
  seekingPreviewInterval: integer("seeking_preview_interval"),
  seekingPreviewColumns: integer("seeking_preview_columns"),
  seekingPreviewTotalFrames: integer("seeking_preview_total_frames"),
  seekingPreviewTileWidth: integer("seeking_preview_tile_width"),
  seekingPreviewTileHeight: integer("seeking_preview_tile_height"),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})
