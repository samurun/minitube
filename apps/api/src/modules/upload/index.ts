import Elysia from "elysia"
import { uploadService } from "./service"

// We deliberately skip Elysia's `t.File()` schema validation here. For large
// uploads the TypeBox validator's behaviour has been unstable across Elysia
// versions (rejecting with "Expected kind 'File'"), and the service already
// validates MIME type and magic bytes itself.
export const uploadRoute = new Elysia({
  prefix: "/upload",
}).post(
  "/video",
  async ({ request }) => {
    const form = await request.formData()
    const file = form.get("file")
    if (!(file instanceof File)) {
      throw new Error("Missing 'file' field in multipart body")
    }
    return uploadService.videoUpload(file)
  },
  {
    tags: ["Upload"],
  }
)
