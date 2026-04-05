import { Elysia } from "elysia"

import { getHealthStatus } from "./service"

export const healthRoute = new Elysia({
  name: "Health.Controller",
}).get("/health", async () => getHealthStatus(), {
  tags: ["Health"],
  detail: {
    summary: "Check API dependency health",
  },
})
