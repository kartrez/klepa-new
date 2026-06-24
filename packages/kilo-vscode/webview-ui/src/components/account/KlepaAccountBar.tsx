import { Component, Show, onMount } from "solid-js"
import { Button } from "@kilocode/kilo-ui/button"
import { Spinner } from "@kilocode/kilo-ui/spinner"
import { useVSCode } from "../../context/vscode"
import { useServer } from "../../context/server"
import { useLanguage } from "../../context/language"

export const KlepaAccountBar: Component = () => {
  const vscode = useVSCode()
  const server = useServer()
  const language = useLanguage()

  onMount(() => server.refreshBalance())

  const label = () => {
    const value = server.balance()
    if (value === null || value === undefined) return "—"
    return value
  }

  return (
    <div class="klepa-account-bar">
      <button
        type="button"
        class="klepa-account-balance"
        onClick={() => server.refreshBalance()}
        title={language.t("profile.balance.refresh")}
      >
        <span class="klepa-account-balance-label">{language.t("profile.balance.title")} $</span>
        <Show when={server.balanceBusy()} fallback={<span class="klepa-account-balance-value">{label()}</span>}>
          <Spinner class="klepa-account-balance-spinner" />
        </Show>
      </button>
      <Button size="small" variant="ghost" onClick={() => vscode.postMessage({ type: "logout" })}>
        {language.t("profile.action.logout")}
      </Button>
    </div>
  )
}
