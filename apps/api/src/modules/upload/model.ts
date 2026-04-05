import { t } from "elysia"

export const uploadModels = {
  uploadFileBody: t.Object({
    file: t.File({
      type: [
        "video/mp4",
        "video/webm",
        "video/quicktime",
        "video/x-msvideo",
        "video/x-matroska",
      ],
      maxSize: "500m",
    }),
  }),
}
