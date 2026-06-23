import { Component, Show, createSignal } from "solid-js"
import { Button } from "@kilocode/kilo-ui/button"
import { Icon } from "@kilocode/kilo-ui/icon"
import { Spinner } from "@kilocode/kilo-ui/spinner"
import { TextField } from "@kilocode/kilo-ui/text-field"
import { useLanguage } from "../../context/language"
import { useVSCode } from "../../context/vscode"
import { KiloLogo } from "../chat/WelcomeEmptyState"
import { GPT_CHAT_BY_TOKEN_URL } from "../../../../src/shared/gpt-chat-by"

export interface GptChatByAuthScreenProps {
  busy?: boolean
  error?: string
}

const GptChatByAuthScreen: Component<GptChatByAuthScreenProps> = (props) => {
  const language = useLanguage()
  const vscode = useVSCode()
  const [token, setToken] = createSignal("")

  const openTokenPage = () => {
    vscode.postMessage({ type: "openExternal", url: GPT_CHAT_BY_TOKEN_URL })
  }

  const startTelegram = () => {
    vscode.postMessage({ type: "gptChatByTelegramLogin" })
  }

  const loginWithToken = () => {
    const key = token().trim()
    if (!key) return
    vscode.postMessage({ type: "gptChatByTokenLogin", token: key })
  }

  return (
    <div class="gpt-chat-by-auth">
      <KiloLogo />
      <h1 class="gpt-chat-by-auth-title">{language.t("gptChatBy.auth.title")}</h1>

      <Show when={props.error}>
        <p class="gpt-chat-by-auth-error" role="alert">
          {props.error}
        </p>
      </Show>

      <button type="button" class="gpt-chat-by-auth-card" onClick={startTelegram} disabled={props.busy}>
        <Icon name="lock" size="small" />
        <div class="gpt-chat-by-auth-card-text">
          <span class="gpt-chat-by-auth-card-title">{language.t("gptChatBy.auth.telegram.title")}</span>
          <span class="gpt-chat-by-auth-card-subtitle">{language.t("gptChatBy.auth.telegram.subtitle")}</span>
        </div>
      </button>

      <div class="gpt-chat-by-auth-field">
        <TextField
          type="password"
          label={language.t("gptChatBy.auth.apiKey.label")}
          value={token()}
          onChange={setToken}
          placeholder={language.t("gptChatBy.auth.apiKey.placeholder")}
          disabled={props.busy}
        />
      </div>

      <button type="button" class="gpt-chat-by-auth-card" onClick={loginWithToken} disabled={props.busy || !token().trim()}>
        <Icon name="circle-check" size="small" />
        <div class="gpt-chat-by-auth-card-text">
          <span class="gpt-chat-by-auth-card-title">{language.t("gptChatBy.auth.token.title")}</span>
          <span class="gpt-chat-by-auth-card-subtitle">{language.t("gptChatBy.auth.token.subtitle")}</span>
        </div>
      </button>

      <Button variant="secondary" size="small" onClick={openTokenPage} disabled={props.busy}>
        {language.t("gptChatBy.auth.getToken")}
      </Button>

      <Show when={props.busy}>
        <div class="gpt-chat-by-auth-busy" role="status">
          <Spinner />
          <span>{language.t("gptChatBy.auth.waiting")}</span>
        </div>
      </Show>
    </div>
  )
}

export default GptChatByAuthScreen
