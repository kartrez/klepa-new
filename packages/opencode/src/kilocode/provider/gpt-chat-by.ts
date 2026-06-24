import { InstallationVersion } from "@opencode-ai/core/installation/version"

export const KLEPA_DEFAULT_MODEL_ID = "klepa/auto"

export const GPT_CHAT_BY_PROVIDER_ID = "klepa"

export const KLEPA_TRAFFIC_SOURCE = `Klepa-AI v-${InstallationVersion}`

export function isKlepaProvider(id: string) {
  return id === GPT_CHAT_BY_PROVIDER_ID || id === "gpt-chat-by"
}

export function klepaTrafficHeaders() {
  return { "X-Traffic-Source": KLEPA_TRAFFIC_SOURCE }
}

export const GPT_CHAT_BY_API_BASE = "https://api.gpt-chat.by/api/"

export const GPT_CHAT_BY_AUTH_URL = "https://gpt-chat.by/vscode-auth/"

export const GPT_CHAT_BY_TOKEN_URL = "https://gpt-chat.by/keys"

export const GPT_CHAT_BY_ENV_KEY = "GPT_CHAT_BY_API_KEY"
