/**
 * HistoryView component
 * Local session history panel.
 */

import { Component, onMount } from "solid-js"
import { Button } from "@kilocode/kilo-ui/button"
import { useLanguage } from "../../context/language"
import SessionList from "./SessionList"

interface HistoryViewProps {
  onSelectSession: (id: string) => void
  onBack?: () => void
}

const HistoryView: Component<HistoryViewProps> = (props) => {
  const language = useLanguage()
  let panel: HTMLDivElement | undefined

  onMount(() => {
    requestAnimationFrame(() => {
      panel
        ?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
          '[data-slot="list-search"] input, [data-slot="list-search"] textarea',
        )
        ?.focus()
    })
  })

  return (
    <div class="history-view">
      <div class="history-view-header">
        <Button variant="ghost" size="small" icon="arrow-left" onClick={() => props.onBack?.()}>
          {language.t("common.goBack")}
        </Button>
      </div>

      <div class="history-view-content" ref={panel}>
        <SessionList onSelectSession={props.onSelectSession} />
      </div>
    </div>
  )
}

export default HistoryView
