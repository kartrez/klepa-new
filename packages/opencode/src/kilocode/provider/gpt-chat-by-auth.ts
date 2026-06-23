import type { Hooks, PluginInput } from "@kilocode/plugin"
import { GPT_CHAT_BY_PROVIDER_ID } from "./gpt-chat-by"

export async function GptChatByAuthPlugin(_input: PluginInput): Promise<Hooks> {
  return {
    auth: {
      provider: GPT_CHAT_BY_PROVIDER_ID,
      async loader(getAuth) {
        const auth = await getAuth()
        if (!auth || auth.type !== "api") return {}
        return { apiKey: auth.key }
      },
      methods: [
        {
          type: "api",
          label: "API key",
        },
        {
          type: "oauth",
          label: "Telegram",
          async authorize() {
            return {
              url: "",
              method: "code" as const,
              instructions: "Open Telegram login in the browser. The extension will complete sign-in automatically.",
              async callback() {
                return { type: "success" as const }
              },
            }
          },
        },
      ],
    },
  }
}
