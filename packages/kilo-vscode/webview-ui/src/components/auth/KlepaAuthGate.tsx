import { type ParentComponent, Show, createMemo } from "solid-js"
import { useServer } from "../../context/server"
import { useProvider } from "../../context/provider"
import { Spinner } from "@kilocode/kilo-ui/spinner"
import { GPT_CHAT_BY_PROVIDER_ID } from "../../../../src/shared/gpt-chat-by"
import GptChatByAuthScreen from "./GptChatByAuthScreen"
import { KiloLogo } from "../chat/WelcomeEmptyState"

export const KlepaAuthGate: ParentComponent = (props) => {
  const server = useServer()
  const provider = useProvider()
  const authed = createMemo(
    () => server.gptAuthed() || provider.authStates()[GPT_CHAT_BY_PROVIDER_ID] !== undefined,
  )
  // Hold loader until connected + providersLoaded so we don't flash the login screen
  // before a stored Klepa key is reflected in authStates.
  const isLoading = createMemo(() => {
    if (authed()) return false
    const state = server.connectionState()
    if (state === "connecting") return true
    if (state === "connected" && !provider.ready()) return true
    return false
  })

  return (
    <Show
      when={!isLoading()}
      fallback={
        <div class="gpt-chat-by-loading">
          <KiloLogo />
          <Spinner />
        </div>
      }
    >
      <Show
        when={authed()}
        fallback={<GptChatByAuthScreen busy={server.authBusy()} error={server.authError()} />}
      >
        {props.children}
      </Show>
    </Show>
  )
}
