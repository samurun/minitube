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
      maxSize: "1024m", // Just a sanity check, actual limit is set higher in the server config
    }),
  }),
}
