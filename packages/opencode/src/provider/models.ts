// kilocode_change - new file
import { Config } from "@/config/config"
import { ModelCache } from "./model-cache"
import * as Core from "@opencode-ai/core/models-dev"
import { Context, Effect, Layer } from "effect"
import { AI_SDK_PROVIDERS, PROMPTS } from "@kilocode/kilo-gateway"
import {
  GPT_CHAT_BY_API_BASE,
  GPT_CHAT_BY_ENV_KEY,
  GPT_CHAT_BY_PROVIDER_ID,
} from "@/kilocode/provider/gpt-chat-by"

export const Model = Core.Model
export type Model = Core.Model
export const Provider = Core.Provider
export type Provider = Core.Provider
export const CatalogModelStatus = Core.CatalogModelStatus
export type CatalogModelStatus = Core.CatalogModelStatus

export interface Interface extends Core.Interface {}

export class Service extends Context.Service<Service, Interface>()("@opencode/ModelsDev") {}

export const layer: Layer.Layer<Service, never, Core.Service | Config.Service | ModelCache.Service> =
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const core = yield* Core.Service
      const config = yield* Config.Service
      const cache = yield* ModelCache.Service

      const get = Effect.fn("ModelsDev.get")(function* () {
        const cfg = yield* config.get()
        const opts = cfg.provider?.[GPT_CHAT_BY_PROVIDER_ID]?.options
        const api = opts?.baseURL ?? GPT_CHAT_BY_API_BASE
        const fetch = opts?.baseURL ? { baseURL: opts.baseURL } : {}
        const models = yield* cache
          .refresh(GPT_CHAT_BY_PROVIDER_ID, fetch)
          .pipe(Effect.catch(() => Effect.succeed({})))

        const providers: Record<string, Core.Provider> = {
          [GPT_CHAT_BY_PROVIDER_ID]: {
            id: GPT_CHAT_BY_PROVIDER_ID,
            name: "Klepa",
            env: [GPT_CHAT_BY_ENV_KEY],
            api,
            npm: "@ai-sdk/openai-compatible",
            models,
          },
        }

        return providers
      })

      return Service.of({ get, refresh: core.refresh })
    }),
  )

export const defaultLayer = layer.pipe(
  Layer.provide(Core.defaultLayer),
  Layer.provide(Config.defaultLayer),
  Layer.provide(ModelCache.defaultLayer),
)

export { AI_SDK_PROVIDERS, PROMPTS }
export * as ModelsDev from "./models"
