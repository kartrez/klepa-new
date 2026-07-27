import { type ParentComponent, Match, Switch, createMemo } from "solid-js"
import { useServer } from "../../context/server"
import { useProvider } from "../../context/provider"
import { useVSCode } from "../../context/vscode"
import { useLanguage } from "../../context/language"
import { Spinner } from "@kilocode/kilo-ui/spinner"
import { Button } from "@kilocode/kilo-ui/button"
import { GPT_CHAT_BY_PROVIDER_ID } from "../../../../src/shared/gpt-chat-by"
import GptChatByAuthScreen from "./GptChatByAuthScreen"
import { KiloLogo } from "../chat/WelcomeEmptyState"

export const KlepaAuthGate: ParentComponent = (props) => {
  const server = useServer()
  const provider = useProvider()
  const vscode = useVSCode()
  const language = useLanguage()
  const authed = createMemo(
    () => server.gptAuthed() || provider.authStates()[GPT_CHAT_BY_PROVIDER_ID] !== undefined,
  )
  // Auth needs a live CLI client. Wait for connected + providersLoaded before
  // showing login; on connection failure show retry instead of a dead auth form.
  const phase = createMemo(() => {
    if (authed()) return "app" as const
    const state = server.connectionState()
    if (state === "error") return "error" as const
    if (state === "connected" && provider.ready()) return "auth" as const
    return "loading" as const
  })

  const retry = () => {
    vscode.postMessage({ type: "retryConnection" })
  }

  return (
    <Switch>
      <Match when={phase() === "loading"}>
        <div class="gpt-chat-by-loading">
          <KiloLogo />
          <Spinner />
        </div>
      </Match>
      <Match when={phase() === "error"}>
        <div class="gpt-chat-by-loading">
          <KiloLogo />
          <p class="gpt-chat-by-auth-error" role="alert">
            {server.errorMessage() || language.t("error.startup.title")}
          </p>
          <Button variant="secondary" size="small" onClick={retry}>
            {language.t("common.retry")}
          </Button>
        </div>
      </Match>
      <Match when={phase() === "auth"}>
        <GptChatByAuthScreen busy={server.authBusy()} error={server.authError()} />
      </Match>
      <Match when={phase() === "app"}>{props.children}</Match>
    </Switch>
  )
}
