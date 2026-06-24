import { Schema } from "effect"
import type { Provider } from "@opencode-ai/core/models-dev"
import { KLEPA_DEFAULT_MODEL_ID } from "./gpt-chat-by"

export const KLEPA_MODELS_PATH = "ai-models/klepa"

type Modality = "text" | "audio" | "image" | "video" | "pdf"

const KlepaArchitecture = Schema.Struct({
  inputModalities: Schema.optional(Schema.Array(Schema.String)),
  outputModalities: Schema.optional(Schema.Array(Schema.String)),
  input_modalities: Schema.optional(Schema.Array(Schema.String)),
  output_modalities: Schema.optional(Schema.Array(Schema.String)),
})

const KlepaModelItem = Schema.Struct({
  name: Schema.String,
  maxTokens: Schema.optional(Schema.Number),
  contextWindow: Schema.optional(Schema.Number),
  supportsImages: Schema.optional(Schema.Boolean),
  supportsPromptCache: Schema.optional(Schema.Boolean),
  supportsNativeTools: Schema.optional(Schema.Boolean),
  supportsReasoningEffort: Schema.optional(Schema.Boolean),
  inputPrice: Schema.optional(Schema.Number),
  outputPrice: Schema.optional(Schema.Number),
  displayName: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  isFree: Schema.optional(Schema.Boolean),
  recommended: Schema.optional(Schema.Boolean),
  architecture: Schema.optional(KlepaArchitecture),
  supportedParameters: Schema.optional(Schema.Array(Schema.String)),
})

export const KlepaModelsResponse = Schema.Array(KlepaModelItem)

export type KlepaModelItem = Schema.Schema.Type<typeof KlepaModelItem>

type Models = Provider["models"]

/** API model ids are sent to the server as-is (e.g. klepa/auto, klepa/free). */
export function klepaModelId(name: string) {
  if (name === "auto" || name === "free") return `klepa/${name}`
  return name
}

export function normalizeKlepaModelId(modelID: string) {
  if (modelID === "auto" || modelID === "free") return `klepa/${modelID}`
  return modelID
}

function mapModalities(values: readonly string[] | undefined): Modality[] {
  const out: Modality[] = []
  for (const value of values ?? []) {
    if (value === "text" || value === "image" || value === "audio" || value === "video" || value === "pdf") {
      out.push(value)
    }
  }
  if (!out.includes("text")) out.unshift("text")
  return out
}

function architectureModalities(item: KlepaModelItem) {
  const arch = item.architecture
  const input = arch?.inputModalities ?? arch?.input_modalities
  const output = arch?.outputModalities ?? arch?.output_modalities
  if ((input?.length ?? 0) > 0 || (output?.length ?? 0) > 0) {
    return { input: mapModalities(input), output: mapModalities(output) }
  }
  const images = item.supportsImages ?? false
  return { input: images ? (["text", "image"] as Modality[]) : (["text"] as Modality[]), output: ["text"] as Modality[] }
}

function hasParam(item: KlepaModelItem, key: string) {
  return item.supportedParameters?.includes(key) ?? false
}

export function toKlepaCatalogModel(item: KlepaModelItem): Models[string] {
  const id = klepaModelId(item.name)
  const modalities = architectureModalities(item)
  const images = modalities.input.includes("image")
  const params = item.supportedParameters
  const tools = item.supportsNativeTools ?? (params ? hasParam(item, "tools") : true)
  const reasoning = item.supportsReasoningEffort ?? (params ? hasParam(item, "reasoning") : false)
  const temperature = params ? hasParam(item, "temperature") : true

  return {
    id,
    name: item.displayName ?? item.name,
    family: item.description ?? "",
    release_date: "",
    attachment: images,
    reasoning,
    temperature,
    tool_call: tools,
    cost: { input: item.inputPrice ?? 0, output: item.outputPrice ?? 0 },
    limit: { context: item.contextWindow ?? 128000, output: item.maxTokens ?? 4096 },
    modalities,
    isFree: item.isFree,
    recommendedIndex: item.recommended ? 0 : undefined,
  }
}

export function klepaModelsFromResponse(items: readonly KlepaModelItem[]): Models {
  return Object.fromEntries(items.map((item) => [klepaModelId(item.name), toKlepaCatalogModel(item)]))
}

export { KLEPA_DEFAULT_MODEL_ID }
