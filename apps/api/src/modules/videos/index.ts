import Elysia from "elysia"
import { videoService } from "./service"
import { videoModels } from "./model"

export const videoRoute = new Elysia({ prefix: "/videos" })
  .get(
    "",
    async ({ query }) =>
      await videoService.getVideos(query.page, query.pageSize),
    {
      tags: ["Video"],
      query: videoModels.listQuery,
    }
  )
  .get(
    "/:id",
    async ({ params }) => {
      const { id } = params
      return await videoService.getVideoById(id)
    },
    {
      tags: ["Video"],
      params: videoModels.videoIdParams,
    }
  )
  .delete(
    "/:id",
    async ({ params }) => {
      const { id } = params
      return await videoService.deleteVideo(id)
    },
    {
      tags: ["Video"],
      params: videoModels.videoIdParams,
    }
  )
