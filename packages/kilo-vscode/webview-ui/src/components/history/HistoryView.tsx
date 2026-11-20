/**
 * HistoryView component
 * Local session history panel.
 */

import { Component, onCleanup, onMount, type Accessor, type JSX } from "solid-js"
import { Button } from "@kilocode/kilo-ui/button"
import { useLanguage } from "../../context/language"
import SessionList from "./SessionList"
import type { SessionInfo } from "../../types/messages"

interface HistoryViewProps {
  onSelectSession: (id: string) => void
  onBack?: () => void
  worktreeSessionIds?: Accessor<ReadonlySet<string> | undefined>
  /** Filter the Local tab to these session ids. */
  sessionIds?: Accessor<ReadonlySet<string> | undefined>
  /** Extra per-row actions rendered in the Local tab. */
  rowActions?: (session: SessionInfo) => JSX.Element
}

const HistoryView: Component<HistoryViewProps> = (props) => {
  const language = useLanguage()
  let panel: HTMLDivElement | undefined

  onMount(() => {
    const frame = requestAnimationFrame(() => {
      panel
        ?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
          '[data-slot="list-search"] input, [data-slot="list-search"] textarea',
        )
        ?.focus()
    })
    onCleanup(() => cancelAnimationFrame(frame))
  })

  return (
    <div class="history-view">
      <div class="history-view-header">
        <Button variant="ghost" size="small" icon="arrow-left" onClick={() => props.onBack?.()}>
          {language.t("common.goBack")}
        </Button>
      </div>

      <div class="history-view-content" ref={panel}>
        <SessionList
          onSelectSession={props.onSelectSession}
          sessionIds={props.sessionIds}
          rowActions={props.rowActions}
        />
      </div>
    </div>
  )
}

export default HistoryView
