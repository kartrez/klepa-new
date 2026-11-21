import "@kilocode/kilo-ui/styles"
import "../src/styles/chat.css"
import { createSignal, onCleanup } from "solid-js"
import { render } from "solid-js/web"
import Settings from "../src/components/settings/Settings"
import { Base } from "../src/context/provider-base"
import { Session } from "../src/context/provider-session"
import { MemoryProvider } from "../src/context/memory"
import { useVSCode } from "../src/context/vscode"

const Content = () => {
  const vscode = useVSCode()
  const host = window as typeof window & {
    KILO_SETTINGS?: { tab?: string; projectId?: string }
    KILO_AGENT_MANAGER_SETTINGS?: boolean
  }
  const [tab, setTab] = createSignal(host.KILO_SETTINGS?.tab)
  const [subtab, setSubtab] = createSignal<string>()
  const [focus, setFocus] = createSignal<{ token: number; value: string }>()
  const [project, setProject] = createSignal(host.KILO_SETTINGS?.projectId)
  const unsubscribe = vscode.onMessage((message) => {
    if (message.type !== "navigate") return
    if (message.view !== "settings") return
    if (message.tab) {
      setTab(message.tab)
      vscode.postMessage({ type: "settingsTabChanged", tab: message.tab })
    }
    if (message.subtab) setSubtab(message.subtab)
    if (message.focus) setFocus((prev) => ({ token: (prev?.token ?? 0) + 1, value: message.focus! }))
    setProject(message.projectId)
  })
  onCleanup(unsubscribe)

  return (
    <div class="container">
      <Settings
        tab={tab()}
        subtab={subtab()}
        focus={focus()}
        agentManagerProjectId={project()}
        agentManagerSettings={host.KILO_AGENT_MANAGER_SETTINGS === true}
        onTabChange={setTab}
        onAgentBehaviourNavigationConsumed={() => {
          setSubtab(undefined)
          setFocus(undefined)
        }}
      />
    </div>
  )
}

const root = document.getElementById("root")
if (!root) throw new Error("Root element not found")

render(
  () => (
    <Base>
      <Session>
        <MemoryProvider>
          <Content />
        </MemoryProvider>
      </Session>
    </Base>
  ),
  root,
)
