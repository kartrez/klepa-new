import { Component, Show, createSignal, onMount, For } from "solid-js"
import { Button } from "@kilocode/kilo-ui/button"
import { Spinner } from "@kilocode/kilo-ui/spinner"
import { DropdownMenu } from "@kilocode/kilo-ui/dropdown-menu"
import { useVSCode } from "../../context/vscode"
import { useServer } from "../../context/server"
import { useLanguage } from "../../context/language"

const amounts = [5, 10, 20, 50] as const

export const KlepaAccountBar: Component = () => {
  const vscode = useVSCode()
  const server = useServer()
  const language = useLanguage()
  const [topUpBusy, setTopUpBusy] = createSignal(false)

  onMount(() => server.refreshBalance())

  const label = () => {
    const value = server.balance()
    if (value === null || value === undefined) return "—"
    return value
  }

  const topUp = (amount: number) => {
    if (topUpBusy()) return
    setTopUpBusy(true)
    vscode.postMessage({ type: "klepaTopUp", supply: "API_BALANCE", amount })
    setTimeout(() => setTopUpBusy(false), 1500)
  }

  return (
    <div class="klepa-account-bar">
      <div class="klepa-account-balance-group">
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
        <DropdownMenu gutter={4} placement="bottom-start">
          <DropdownMenu.Trigger
            class="klepa-topup-trigger"
            disabled={topUpBusy()}
            aria-label={language.t("account.topUp")}
          >
            <Show when={topUpBusy()} fallback={language.t("account.topUp")}>
              <Spinner class="klepa-account-balance-spinner" />
            </Show>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content class="klepa-topup-menu">
              <For each={amounts}>
                {(amount) => (
                  <DropdownMenu.Item onSelect={() => topUp(amount)}>
                    <DropdownMenu.ItemLabel>
                      {language.t("account.topUpAmount", { amount: String(amount) })}
                    </DropdownMenu.ItemLabel>
                  </DropdownMenu.Item>
                )}
              </For>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu>
      </div>
      <Button size="small" variant="ghost" onClick={() => server.logout()}>
        {language.t("profile.action.logout")}
      </Button>
    </div>
  )
}
