import type { KiloConnectionService } from "./cli-backend/connection-service"
import { routeAutocompleteMessage } from "./autocomplete/settings"
import type { SpeechToTextSource } from "../speech-to-text/source"

type Msg = {
  type: string
  requestId?: string
  model?: string
  language?: string
}

type Ctx = {
  connection: KiloConnectionService
  dir: string
  post: (msg: unknown) => void
  speechSource?: () => SpeechToTextSource | undefined
}

export async function routeInputToolMessage(message: Msg, ctx: Ctx): Promise<boolean> {
  if (await routeAutocompleteMessage(message, ctx.post)) return true

  // Speech-to-Text (requires ffmpeg & Kilo Gateway) is disabled in Klepa.
  if (message.type === "speechToTextPrewarm" || message.type === "speechToTextCancel") {
    return true
  }

  if (message.type === "speechToTextStart" || message.type === "speechToTextStop") {
    if (message.requestId) {
      ctx.post({ type: "speechToTextCancelled", requestId: message.requestId })
    }
    return true
  }

  return false
}
