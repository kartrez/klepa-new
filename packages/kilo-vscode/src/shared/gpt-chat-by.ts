export const GPT_CHAT_BY_PROVIDER_ID = "klepa"

export const KLEPA_DEFAULT_MODEL_ID = "klepa/auto"

export function normalizeKlepaModelId(modelID: string) {
  if (modelID === "auto" || modelID === "free") return `klepa/${modelID}`
  return modelID
}

export const EXTENSION_ID = "copy-code.copy-coder"

export const EXTENSION_LOGIN_PATH = "/loginhook"

export const GPT_CHAT_BY_API_BASE = "https://api.gpt-chat.by/api/"

export const GPT_CHAT_BY_AUTH_URL = "https://gpt-chat.by/vscode-auth/"

export const GPT_CHAT_BY_TOKEN_URL = "https://gpt-chat.by/"

export const GPT_CHAT_BY_DEFAULT_CONFIG = {
  enabled_providers: [GPT_CHAT_BY_PROVIDER_ID],
  provider: {
    [GPT_CHAT_BY_PROVIDER_ID]: {
      name: "Klepa",
      npm: "@ai-sdk/openai-compatible",
      api: GPT_CHAT_BY_API_BASE,
      env: ["GPT_CHAT_BY_API_KEY"],
    },
  },
} as const
