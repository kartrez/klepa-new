import { type ParentComponent, Show, createMemo } from "solid-js"
import { useServer } from "../../context/server"
import { useProvider } from "../../context/provider"
import { GPT_CHAT_BY_PROVIDER_ID } from "../../../../src/shared/gpt-chat-by"
import GptChatByAuthScreen from "./GptChatByAuthScreen"

export const KlepaAuthGate: ParentComponent = (props) => {
  const server = useServer()
  const provider = useProvider()
  const authed = createMemo(
    () => server.gptAuthed() || provider.authStates()[GPT_CHAT_BY_PROVIDER_ID] !== undefined,
  )

  return (
    <Show
      when={authed()}
      fallback={<GptChatByAuthScreen busy={server.authBusy()} error={server.authError()} />}
    >
      {props.children}
    </Show>
  )
}
