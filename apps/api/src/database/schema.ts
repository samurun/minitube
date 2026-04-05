import { pgTable, serial, varchar, text, timestamp } from "drizzle-orm/pg-core"

export const videos = pgTable("videos", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  rawPath: varchar("raw_path", { length: 512 }).notNull(),
  thumbnailPath: varchar("thumbnail_path", { length: 512 }),
  thumbnailErrorMessage: text("thumbnail_error_message"),
  seekingPreviewPath: varchar("seeking_preview_path", { length: 512 }),
  seekingPreviewErrorMessage: text("seeking_preview_error_message"),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})
