import { t } from "elysia"

export const videoModels = {
  videoIdParams: t.Object({
    id: t.Numeric({ minimum: 1 }),
  }),
  listQuery: t.Object({
    page: t.Numeric({ minimum: 1, default: 1 }),
    pageSize: t.Numeric({ minimum: 1, maximum: 100, default: 20 }),
  }),
}
