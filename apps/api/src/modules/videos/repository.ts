import { desc, eq } from "drizzle-orm"
import { db } from "../../database"
import { videos } from "../../database/schema"

export type VideoRecord = typeof videos.$inferSelect
export type NewVideo = typeof videos.$inferInsert

export const videoRepository = {
  list: async (page: number, pageSize: number): Promise<VideoRecord[]> => {
    const offset = (page - 1) * pageSize
    return db
      .select()
      .from(videos)
      .orderBy(desc(videos.createdAt))
      .limit(pageSize)
      .offset(offset)
  },

  findById: async (id: number): Promise<VideoRecord | null> => {
    const [row] = await db
      .select()
      .from(videos)
      .where(eq(videos.id, id))
      .limit(1)
    return row ?? null
  },

  create: async (data: NewVideo): Promise<VideoRecord> => {
    const [row] = await db.insert(videos).values(data).returning()
    if (!row) throw new Error("Insert returned no row")
    return row
  },

  deleteById: async (id: number): Promise<VideoRecord | null> => {
    const [row] = await db.delete(videos).where(eq(videos.id, id)).returning()
    return row ?? null
  },
}
