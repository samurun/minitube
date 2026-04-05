import Elysia from "elysia"
import { uploadModels } from "./model"
import { uploadService } from "./service"

export const uploadRoute = new Elysia({
  prefix: "/upload",
}).post("/video", async ({ body }) => uploadService.videoUpload(body.file), {
  tags: ["Upload"],
  body: uploadModels.uploadFileBody,
})
