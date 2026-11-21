import * as vscode from "vscode"
import { basename } from "node:path"
import { KiloProvider } from "./KiloProvider"
import { isAuthCallbackPath } from "./kilo-provider/handlers/gpt-chat-by-auth"
import { AgentManagerProvider } from "./agent-manager/AgentManagerProvider"
import { VscodeHost } from "./agent-manager/vscode-host"
import { DiffViewerProvider } from "./diff/DiffViewerProvider"
import { DocumentViewerProvider } from "./DocumentViewerProvider"
import { DiffSourceCatalog } from "./diff/sources/catalog"
import { DiffVirtualProvider } from "./DiffVirtualProvider"
import { SettingsEditorProvider } from "./SettingsEditorProvider"
import { SubAgentViewerProvider } from "./SubAgentViewerProvider"
import { EXTENSION_DISPLAY_NAME } from "./constants"
import { KiloConnectionService } from "./services/cli-backend"
import { retention } from "./services/task-cleanup/retention"
import { registerAutocompleteProvider } from "./services/autocomplete"
import { ensureBackendForAutocomplete } from "./services/autocomplete/ensure-backend"
import { AutocompleteServiceManager } from "./services/autocomplete/AutocompleteServiceManager"
import { configFeatures } from "./features"
import { AttentionService, showOSNotification } from "./services/attention"
import { BrowserAutomationService } from "./services/browser-automation"
import { TelemetryEventName, TelemetryProxy } from "./services/telemetry"
import { registerCommitMessageService } from "./services/commit-message"
import { registerCodeActions, registerTerminalActions, KiloCodeActionProvider } from "./services/code-actions"
import { closeTaskTarget, SurfaceFocus } from "./commands/close-task-target"
import { registerToggleAutoApprove } from "./commands/toggle-auto-approve"
import { markWorkspace } from "./util/spotlight"
import { createGitExecutable } from "./util/git-executable"
import { isCursorHost } from "./utils"
import { sameDirectory } from "./kilo-provider-utils"
import { mcpAuth } from "./services/mcp-auth"
import { showAuthUrl } from "./kilo-provider/mcp-oauth"

let agentManager: AgentManagerProvider | undefined
let shuttingDown = false

const RESTORE_KEY = "kilo.workbench.restore"

type RestoreState = {
  agentManager?: boolean
}

const panelTitleHandler = (panel: vscode.WebviewPanel) => (title: string) => {
  panel.title = title || EXTENSION_DISPLAY_NAME
}

// Activated via "onStartupFinished" and "onUri" (package.json) so that commands, code actions,
// keybindings, autocomplete, commit-message generation, and URI deep links all work immediately —
// without requiring the user to open a Kilo sidebar or panel first. The CLI backend is NOT spawned here;
// it starts lazily when a webview connects or when ensureBackendForAutocomplete() triggers it.
export async function activate(context: vscode.ExtensionContext) {
  console.log("Kilo Code extension is now active")
  shuttingDown = false

  const features = configFeatures()

  // Drives the "!kilo-code.new.isCursor" guards on the native view/title and
  // editor/title menu contributions — see isCursorHost() for why.
  void vscode.commands.executeCommand("setContext", "kilo-code.new.isCursor", isCursorHost())
  const telemetry = TelemetryProxy.getInstance()

  // Create shared connection service (one server for all webviews)
  const connectionService = new KiloConnectionService(
    context,
    undefined,
    (dir): Promise<void> => browserAutomationService.ready(dir),
  )

  // One MCP OAuth sign-in service for the whole extension (sidebar, Kilo tabs, Settings).
  // Initialize it eagerly so its MCP OAuth URL subscriptions and `onUrl`
  // fallback are wired up exactly once, instead of racing whichever
  // KiloProvider happens to construct first.
  mcpAuth(connectionService, { onUrl: showAuthUrl })

  // Manages the built-in Playwright MCP server for ordinary sessions.
  const browserAutomationService = new BrowserAutomationService(connectionService)
  void browserAutomationService.syncWithSettings()
  let restore = context.workspaceState.get<RestoreState>(RESTORE_KEY) ?? {}
  const remember = (patch: RestoreState) => {
    const next = { ...restore, ...patch }
    if (shuttingDown && patch.agentManager === false) next.agentManager = restore.agentManager
    restore = next
    void context.workspaceState.update(RESTORE_KEY, restore)
  }

  // Daily trigger for the backend-owned session retention pass (Settings → Checkpoints)
  const cleanup = retention(connectionService, context)
  cleanup.start()
  context.subscriptions.push({ dispose: () => cleanup.dispose() })

  const unsubscribeStateChange = connectionService.onStateChange((state) => {
    if (state === "connected") {
      void browserAutomationService
        .reregisterIfEnabled()
        .catch((error) => console.warn("[Kilo New] Playwright MCP re-registration failed:", error))
      const config = connectionService.getServerConfig()
      if (config) telemetry.configure(config.baseUrl, config.password)
      if (features.autocomplete) AutocompleteServiceManager.getInstance()?.load()
    }
  })

  context.subscriptions.push(vscode.env.onDidChangeTelemetryEnabled((enabled) => telemetry.setHostEnabled(enabled)))

  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    void markWorkspace(folder.uri.fsPath, (msg) => console.warn(`[Kilo New] ${msg}`))
  }

  // Track all open tab panel providers so toolbar button commands can target them.
  // NOTE: The editor/title toolbar for tab panels intentionally omits Agent Manager
  // and Marketplace buttons (unlike the sidebar). Too many icons causes VS Code to
  // collapse them into a "..." overflow menu, hiding important buttons like Settings.
  const tabPanels = new Map<vscode.WebviewPanel, KiloProvider>()
  const activeTabProvider = () => {
    for (const [panel, p] of tabPanels) {
      if (panel.active) return p
    }
    return undefined
  }

  // Tracks the Kilo surface the user last worked in, so commands invoked from
  // the Command Palette still know where to act after it takes focus away.
  const focus = new SurfaceFocus()

  // Keep the concrete chat when focus moves to the editor to select code.
  // SurfaceFocus alone cannot distinguish multiple Kilo editor tabs.
  let chat: KiloProvider | AgentManagerProvider | undefined

  // Create the provider with shared service
  const provider = new KiloProvider(context.extensionUri, connectionService, context, {
    focusContext: "kilo-code.new.sidebarFocused",
    onFocused: () => {
      focus.gained("sidebar")
      chat = provider
    },
    onHidden: () => focus.lost("sidebar"),
  })

  const deliver = (comments: unknown[], autoSend: boolean, sessionID?: string, directory?: string): void => {
    const target = sessionID
      ? [...tabPanels.values()].find((item) => {
          if (item.getCurrentSessionId() !== sessionID || !item.canReceiveReviewComments()) return false
          if (!directory) return true
          return [item.getSessionDirectories().get(sessionID), item.getSessionGitDirectory(sessionID)]
            .filter((value): value is string => value !== undefined)
            .some((value) => sameDirectory(value, directory))
        })
      : undefined
    const destination = target ?? provider
    void destination.appendReviewComments(comments, autoSend, sessionID)
  }
  provider.setReviewCommentsHandler(deliver)

  // Register the webview view provider for the sidebar.
  // retainContextWhenHidden keeps the webview alive when switching to other sidebar panels.
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(KiloProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  )

  // Ensure Agent Manager navigation keybindings work when a VS Code terminal has focus.
  // The terminal intercepts all keystrokes unless the command is listed in
  // terminal.integrated.commandsToSkipShell, which only contains built-in
  // commands by default.
  const skip = [
    "kilo-code.new.agentManagerOpen",
    "kilo-code.new.agentManager.showTerminal",
    "kilo-code.new.agentManager.previousTerminal",
    "kilo-code.new.agentManager.nextTerminal",
  ]
  if (process.platform === "darwin") skip.push("kilo-code.new.agentManager.runScript")
  ensureCommandsSkipShell(skip)

  const git = createGitExecutable({
    preferred: async () => {
      const extension = vscode.extensions.getExtension("vscode.git")
      if (!extension) return undefined
      if (!extension.isActive) await extension.activate()
      return extension.exports?.getAPI(1).git.path
    },
    log: (message) => console.warn(`[Kilo New] ${message}`),
  })
  const binary = process.platform === "win32" ? await git() : git
  const agentManagerHost = new VscodeHost(context.extensionUri, connectionService, context)
  const agentManagerProvider = new AgentManagerProvider(agentManagerHost, connectionService, binary)
  agentManagerHost.setFocusListener({
    gained: () => {
      focus.gained("agentManager")
      // Webview focus messages can arrive after the panel's active state changes.
      chat = agentManagerProvider
    },
    lost: () => {
      focus.lost("agentManager")
      // The host reports lost on panel disposal, not when switching to an editor.
      if (chat === agentManagerProvider) chat = undefined
    },
  })
  agentManagerProvider.onPanelVisibilityChange((visible) => remember({ agentManager: visible }))
  agentManager = agentManagerProvider
  context.subscriptions.push(agentManagerProvider)

  // Wire "Continue in Worktree" from sidebar → Agent Manager
  provider.setContinueInWorktreeHandler((sessionId, progress) =>
    agentManagerProvider.continueFromSidebar(sessionId, progress),
  )
  provider.setCreateWorktreeHandler((baseBranch, branchName) =>
    agentManagerProvider.createFromSidebar(baseBranch, branchName),
  )

  // Register toggle auto-approve shortcut (Ctrl+Alt+A / Cmd+Alt+A)
  const defaultDir = () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd()
  const autoApprove = registerToggleAutoApprove(
    context,
    connectionService,
    (sessionId) => {
      if (sessionId) {
        const dir =
          provider.getSessionDirectories().get(sessionId) ?? agentManagerProvider.getSessionDirectories().get(sessionId)
        if (dir) return dir
      }
      return defaultDir()
    },
    () => {
      const dirs = new Set([defaultDir()])
      for (const dir of provider.getSessionDirectories().values()) dirs.add(dir)
      for (const dir of agentManagerProvider.getSessionDirectories().values()) dirs.add(dir)
      return [...dirs]
    },
  )
  const attention = new AttentionService(connectionService, {
    approve: (event, directory) => autoApprove.approve(event, directory),
    details: async (sessionID, directory) => {
      provider.rememberSession(sessionID, directory)
      const session = await provider.getSessionInfo(sessionID)
      const dir = directory ?? session?.directory
      const workspace = dir
        ? (vscode.workspace.getWorkspaceFolder(vscode.Uri.file(dir))?.name ?? basename(dir))
        : (vscode.workspace.name ?? "Workspace")
      return { workspace, session: session?.title ?? session?.slug ?? sessionID }
    },
    focused: () => vscode.window.state.focused,
    // Every surface already reports the session it displays, gated on its own
    // visibility, so this covers the sidebar, Kilo editor tabs, and Agent
    // Manager without each one needing its own accessor.
    visible: (sessionID) => connectionService.isVisible(sessionID),
    os: showOSNotification,
    show: async (sessionID, directory) => {
      if (await agentManagerProvider.revealSession(sessionID)) return
      await vscode.commands.executeCommand("kilo-code.SidebarProvider.focus")
      await provider.openSession(sessionID, directory)
    },
  })

  // Prewarm only after all global event consumers are ready.
  if (features.autocomplete) ensureBackendForAutocomplete(connectionService)

  provider.setAutoApproveController(autoApprove)
  agentManagerHost.setAutoApproveController(autoApprove)

  // Register serializer so Agent Manager restores when VS Code restarts
  context.subscriptions.push(
    vscode.window.registerWebviewPanelSerializer(AgentManagerProvider.viewType, {
      deserializeWebviewPanel(panel: vscode.WebviewPanel) {
        if (restore.agentManager === false) {
          panel.dispose()
          return Promise.resolve()
        }
        const ctx = agentManagerHost.wrapExistingPanel(panel, {
          onBeforeMessage: (msg) => agentManagerProvider.handleMessage(msg),
          worktreeDirectories: () => agentManagerProvider.getWorktreeDirectories(),
          workspaceRoot: () => agentManagerProvider.workspaceRoot(),
          projectId: () => agentManagerProvider.projectId(),
          sessionProject: () => agentManagerProvider.sessionProject(),
        })
        agentManagerProvider.deserializePanel(ctx)
        return Promise.resolve()
      },
    }),
  )

  const attach = (panel: vscode.WebviewPanel) => {
    const tabProvider = new KiloProvider(context.extensionUri, connectionService, context, {
      tabTitle: panelTitleHandler(panel),
      topBarSurface: "tab",
      onFocused: () => {
        focus.gained("tab")
        chat = tabProvider
      },
      onHidden: () => {
        focus.lost("tab")
        if (chat === tabProvider) chat = undefined
      },
    })
    tabProvider.setAutoApproveController(autoApprove)
    tabProvider.setContinueInWorktreeHandler((sessionId, progress) =>
      agentManagerProvider.continueFromSidebar(sessionId, progress),
    )
    tabProvider.setCreateWorktreeHandler((baseBranch, branchName) =>
      agentManagerProvider.createFromSidebar(baseBranch, branchName),
    )
    tabProvider.setDiffVirtualProvider(diffVirtualProvider)
    tabProvider.setDiffViewerProvider(diffViewerProvider)
    tabProvider.setReviewCommentsHandler(deliver)
    tabProvider.resolveWebviewPanel(panel)
    tabPanels.set(panel, tabProvider)
    return tabProvider
  }
  // Register serializer so "Open in Tab" restores when VS Code restarts
  context.subscriptions.push(
    vscode.window.registerWebviewPanelSerializer("kilo-code.new.TabPanel", {
      deserializeWebviewPanel(panel: vscode.WebviewPanel) {
        const tabProvider = attach(panel)
        panel.onDidDispose(
          () => {
            console.log("[Kilo New] Tab panel restored from restart disposed")
            tabPanels.delete(panel)
            tabProvider.dispose()
          },
          null,
          context.subscriptions,
        )
        return Promise.resolve()
      },
    }),
  )

  const diffSourceCatalog = new DiffSourceCatalog(connectionService)
  context.subscriptions.push(diffSourceCatalog)
  const diffViewerProvider = new DiffViewerProvider(context.extensionUri, connectionService, diffSourceCatalog, {
    sessionIdProvider: () => provider.getCurrentSessionId(),
    sessionDirectoryProvider: (sessionId) => provider.getSessionGitDirectory(sessionId),
  })
  diffViewerProvider.setCommentHandler((comments, autoSend) => {
    void provider.appendReviewComments(comments, autoSend)
  })
  provider.setDiffViewerProvider(diffViewerProvider)
  context.subscriptions.push(diffViewerProvider)

  const documentViewerProvider = new DocumentViewerProvider(context.extensionUri, connectionService, {
    onComments: (comments, autoSend) => void provider.appendReviewComments(comments, autoSend),
  })
  provider.setDocumentViewerProvider(documentViewerProvider)
  context.subscriptions.push(documentViewerProvider)

  // Create diff virtual provider (lightweight single-file diff for permission approval)
  const diffVirtualProvider = new DiffVirtualProvider(context.extensionUri)
  provider.setDiffVirtualProvider(diffVirtualProvider)
  agentManagerHost.setDiffVirtualProvider(diffVirtualProvider)
  context.subscriptions.push(diffVirtualProvider)

  // Create standalone editor providers (open in editor area, not sidebar)
  const settingsEditorProvider = new SettingsEditorProvider(context.extensionUri, connectionService, context, {
    ...agentManagerProvider.settings,
  })
  context.subscriptions.push(settingsEditorProvider)

  // Create sub-agent viewer provider (read-only editor panel for sub-agent sessions)
  const subAgentViewerProvider = new SubAgentViewerProvider(context.extensionUri, connectionService, context)
  context.subscriptions.push(subAgentViewerProvider)

  // Register serializers so standalone panels restore on restart
  context.subscriptions.push(
    vscode.window.registerWebviewPanelSerializer("kilo-code.new.settingsPanel", {
      deserializeWebviewPanel(panel: vscode.WebviewPanel) {
        settingsEditorProvider.deserializePanel(panel)
        return Promise.resolve()
      },
    }),
  )

  context.subscriptions.push(
    vscode.window.registerWebviewPanelSerializer(DocumentViewerProvider.viewType, {
      deserializeWebviewPanel(panel: vscode.WebviewPanel) {
        panel.dispose()
        return Promise.resolve()
      },
    }),
  )

  context.subscriptions.push(
    vscode.window.registerWebviewPanelSerializer(DiffViewerProvider.viewType, {
      deserializeWebviewPanel(panel: vscode.WebviewPanel) {
        diffViewerProvider.deserializePanel(panel)
        return Promise.resolve()
      },
    }),
  )

  context.subscriptions.push(
    vscode.window.registerWebviewPanelSerializer("kilo-code.new.SubAgentViewerPanel", {
      deserializeWebviewPanel(panel: vscode.WebviewPanel) {
        // Sub-agent viewer requires a session ID that can't be recovered
        // after restart, so dispose the stale panel cleanly.
        panel.dispose()
        return Promise.resolve()
      },
    }),
  )

  // Task-close commands stop work on whichever surface the user is on, so they
  // resolve their target from the last focused surface rather than from panel
  // activation alone.
  const taskTarget = () =>
    closeTaskTarget<KiloProvider | AgentManagerProvider>({
      focused: focus.current(),
      sidebar: provider,
      tab: activeTabProvider(),
      agentManager: agentManagerProvider.isActive() ? agentManagerProvider : undefined,
    })

  // Sidebar menus use wrapper commands so this event measures real title button presses,
  // not programmatic opens, shortcuts, or editor title commands.
  const track = (button: string, command: string) => {
    TelemetryProxy.capture(TelemetryEventName.TITLE_BUTTON_CLICKED, {
      button,
      surface: "sidebar_title",
    })
    void vscode.commands.executeCommand(command)
  }

  // Register toolbar button command handlers
  context.subscriptions.push(
    vscode.commands.registerCommand("kilo-code.new.sidebarTitle.plusButtonClicked", () => {
      track("new_task", "kilo-code.new.plusButtonClicked")
    }),
    vscode.commands.registerCommand("kilo-code.new.sidebarTitle.historyButtonClicked", () => {
      track("history", "kilo-code.new.historyButtonClicked")
    }),
    vscode.commands.registerCommand("kilo-code.new.sidebarTitle.agentManagerOpen", () => {
      track("agent_manager", "kilo-code.new.agentManagerOpen")
    }),
    vscode.commands.registerCommand("kilo-code.new.sidebarTitle.settingsButtonClicked", () => {
      track("settings", "kilo-code.new.settingsButtonClicked")
    }),
    vscode.commands.registerCommand("kilo-code.new.plusButtonClicked", () => {
      const tab = activeTabProvider()
      if (tab) tab.postMessage({ type: "action", action: "plusButtonClicked" })
      else provider.postMessage({ type: "action", action: "plusButtonClicked" })
    }),
    vscode.commands.registerCommand("kilo-code.new.closeTask", () => {
      taskTarget().postMessage({ type: "action", action: "closeTask" })
    }),
    vscode.commands.registerCommand("kilo-code.new.closeAllTasks", () => {
      taskTarget().postMessage({ type: "action", action: "closeAllTasks" })
    }),
    vscode.commands.registerCommand("kilo-code.new.agentManagerOpen", () => {
      agentManagerProvider.openPanel()
    }),
    vscode.commands.registerCommand("kilo-code.new.historyButtonClicked", () => {
      const tab = activeTabProvider()
      if (tab) tab.postMessage({ type: "action", action: "historyButtonClicked" })
      else provider.postMessage({ type: "action", action: "historyButtonClicked" })
    }),
    vscode.commands.registerCommand("kilo-code.new.cycleAgentMode", () => {
      const tab = activeTabProvider()
      if (tab) tab.postMessage({ type: "action", action: "cycleAgentMode" })
      else provider.postMessage({ type: "action", action: "cycleAgentMode" })
      agentManagerProvider.postMessage({ type: "action", action: "cycleAgentMode" })
    }),
    vscode.commands.registerCommand("kilo-code.new.cyclePreviousAgentMode", () => {
      const tab = activeTabProvider()
      if (tab) tab.postMessage({ type: "action", action: "cyclePreviousAgentMode" })
      else provider.postMessage({ type: "action", action: "cyclePreviousAgentMode" })
      agentManagerProvider.postMessage({ type: "action", action: "cyclePreviousAgentMode" })
    }),
    vscode.commands.registerCommand("kilo-code.new.settingsButtonClicked", (tab?: string, projectId?: string) => {
      settingsEditorProvider.openPanel("settings", tab, projectId)
    }),
    vscode.commands.registerCommand("kilo-code.new.settingsSearch", () => {
      settingsEditorProvider.focusSearch()
    }),
    vscode.commands.registerCommand("kilo-code.new.openMcpSettings", (focus?: string) => {
      settingsEditorProvider.openPanel("settings", "agentBehaviour", undefined, "mcpServers", focus)
    }),
    vscode.commands.registerCommand("kilo-code.new.generateTerminalCommand", async () => {
      const input = await vscode.window.showInputBox({
        prompt: "Describe the terminal command you want to generate",
        placeHolder: "e.g., find all .ts files modified in the last 24 hours",
      })
      if (!input) return
      await vscode.commands.executeCommand("kilo-code.SidebarProvider.focus")
      await provider.waitForReady()
      provider.postMessage({
        type: "triggerTask",
        text: `Generate a terminal command: ${input}`,
        injectedTitle: "Generate terminal command",
      })
    }),
    vscode.commands.registerCommand("kilo-code.new.openInTab", () => {
      return openKiloInNewTab(context, tabPanels, attach)
    }),
    vscode.commands.registerCommand(
      "kilo-code.new.showChanges",
      (arg?: Parameters<DiffViewerProvider["openFromCommand"]>[0]) => {
        diffViewerProvider.openFromCommand(arg)
      },
    ),
    vscode.commands.registerCommand(
      "kilo-code.new.openSubAgentViewer",
      (sessionID: string, title?: string, directory?: string) => {
        subAgentViewerProvider.openPanel(sessionID, title, directory)
      },
    ),
    // One shortcut pair serves the sidebar, Kilo editor tabs, and Agent Manager.
    // Every surface receives the action and acts only while it has focus, matching
    // cycleAgentMode, so one binding never depends on a shared focus context key.
    vscode.commands.registerCommand("kilo-code.new.agentManager.previousSession", () => {
      agentManagerProvider.postMessage({ type: "action", action: "sessionPrevious" })
    }),
    vscode.commands.registerCommand("kilo-code.new.agentManager.nextSession", () => {
      agentManagerProvider.postMessage({ type: "action", action: "sessionNext" })
    }),
    vscode.commands.registerCommand("kilo-code.new.agentManager.previousTab", () => {
      const tab = activeTabProvider()
      if (tab) tab.postMessage({ type: "action", action: "tabPrevious" })
      provider.postMessage({ type: "action", action: "tabPrevious" })
      agentManagerProvider.postMessage({ type: "action", action: "tabPrevious" })
    }),
    vscode.commands.registerCommand("kilo-code.new.agentManager.nextTab", () => {
      const tab = activeTabProvider()
      if (tab) tab.postMessage({ type: "action", action: "tabNext" })
      provider.postMessage({ type: "action", action: "tabNext" })
      agentManagerProvider.postMessage({ type: "action", action: "tabNext" })
    }),
    vscode.commands.registerCommand("kilo-code.new.agentManager.previousTerminal", () => {
      agentManagerProvider.postMessage({ type: "action", action: "terminalPrevious" })
    }),
    vscode.commands.registerCommand("kilo-code.new.agentManager.nextTerminal", () => {
      agentManagerProvider.postMessage({ type: "action", action: "terminalNext" })
    }),
    vscode.commands.registerCommand("kilo-code.new.agentManager.diagnostics", () => {
      // diagnose() spawns git/gh probes and writes to the output channel; a rejection (disposed
      // channel, disposed context mid-probe) would otherwise be an invisible unhandled rejection.
      void agentManagerProvider.diagnose().catch((err: unknown) => {
        console.error("[Kilo New] Agent Manager diagnostics failed:", err)
      })
    }),
    vscode.commands.registerCommand("kilo-code.new.agentManager.search", () => {
      agentManagerProvider.postMessage({ type: "action", action: "search" })
    }),
    vscode.commands.registerCommand("kilo-code.new.agentManager.showTerminal", () => {
      // Route through the webview so it can reach into the active session
      // state and open the VS Code integrated terminal for it.
      agentManagerProvider.postMessage({ type: "action", action: "showTerminal" })
    }),
    vscode.commands.registerCommand("kilo-code.new.agentManager.runScript", () => {
      agentManagerProvider.postMessage({ type: "action", action: "runScript" })
    }),
    vscode.commands.registerCommand("kilo-code.new.agentManager.toggleDiff", () => {
      agentManagerProvider.postMessage({ type: "action", action: "toggleDiff" })
    }),
    vscode.commands.registerCommand("kilo-code.new.agentManager.showShortcuts", () => {
      agentManagerProvider.postMessage({ type: "action", action: "showShortcuts" })
    }),

    vscode.commands.registerCommand("kilo-code.new.agentManager.newTab", () => {
      agentManagerProvider.postMessage({ type: "action", action: "newTab" })
    }),
    vscode.commands.registerCommand("kilo-code.new.agentManager.newTerminalTab", () => {
      agentManagerProvider.postMessage({ type: "action", action: "newTerminalTab" })
    }),
    vscode.commands.registerCommand("kilo-code.new.agentManager.newSideTerminal", () => {
      agentManagerProvider.postMessage({ type: "action", action: "newSideTerminal" })
    }),
    vscode.commands.registerCommand("kilo-code.new.agentManager.closeTab", () => {
      agentManagerProvider.postMessage({ type: "action", action: "closeTab" })
    }),
    vscode.commands.registerCommand("kilo-code.new.agentManager.newWorktree", () => {
      agentManagerProvider.postMessage({ type: "action", action: "newWorktree" })
    }),
    vscode.commands.registerCommand("kilo-code.new.agentManager.quickWorktree", () => {
      agentManagerProvider.postMessage({ type: "action", action: "quickWorktree" })
    }),
    vscode.commands.registerCommand("kilo-code.new.agentManager.openWorktree", () => {
      agentManagerProvider.postMessage({ type: "action", action: "openWorktree" })
    }),
    vscode.commands.registerCommand("kilo-code.new.agentManager.updateFromBase", () => {
      agentManagerProvider.postMessage({ type: "action", action: "updateFromBase" })
    }),
    vscode.commands.registerCommand("kilo-code.new.agentManager.openPR", () => {
      agentManagerProvider.postMessage({ type: "action", action: "openPR" })
    }),
    vscode.commands.registerCommand("kilo-code.new.agentManager.closeWorktree", () => {
      agentManagerProvider.postMessage({ type: "action", action: "closeWorktree" })
    }),
    vscode.commands.registerCommand("kilo-code.new.agentManager.advancedWorktree", () =>
      agentManagerProvider.openAdvancedWorktree(),
    ),
    ...Array.from({ length: 9 }, (_, i) =>
      vscode.commands.registerCommand(`kilo-code.new.agentManager.jumpTo${i + 1}`, () => {
        agentManagerProvider.postMessage({ type: "action", action: `jumpTo${i + 1}` })
      }),
    ),
  )

  // Register URI handler for extension deep links (vscode://copy-code.copy-coder/...)
  context.subscriptions.push(
    vscode.window.registerUriHandler({
      async handleUri(uri: vscode.Uri) {
        if (!isAuthCallbackPath(uri.path)) return
        console.log("[Kilo New] URI handler: gpt-chat.by loginhook")
        await vscode.commands.executeCommand(`${KiloProvider.viewType}.focus`)
        await provider.handleGptChatByAuthCallback(uri)
      },
    }),
  )

  // Register autocomplete provider
  if (features.autocomplete) void registerAutocompleteProvider(context, connectionService)

  // Register commit message generation
  registerCommitMessageService(context, connectionService)

  context.subscriptions.push(
    vscode.commands.registerCommand("kilo-code.new.reload", () => {
      provider.reload().catch((e) => console.error("[Kilo New] reload command failed:", e))
    }),
  )

  // Register code actions (editor context menus, terminal context menus, keyboard shortcuts)
  registerCodeActions(context, provider, agentManagerProvider, activeTabProvider, () => chat)
  registerTerminalActions(context, provider, agentManagerProvider)

  // Register CodeActionProvider (lightbulb quick fixes)
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { scheme: "file" },
      new KiloCodeActionProvider(),
      KiloCodeActionProvider.metadata,
    ),
  )

  // Dispose services when extension deactivates (kills the server)
  context.subscriptions.push({
    dispose: () => {
      shuttingDown = true
      unsubscribeStateChange()
      attention.dispose()
      browserAutomationService.dispose()
      provider.dispose()
      connectionService.dispose()
    },
  })
}

export async function deactivate() {
  shuttingDown = true
  const results = await Promise.allSettled([agentManager?.shutdown()])
  for (const result of results) {
    if (result.status === "rejected") console.warn("[Kilo New] Extension shutdown failed:", result.reason)
  }
  TelemetryProxy.getInstance().shutdown()
}

function openKiloInNewTab(
  context: vscode.ExtensionContext,
  tabPanels: Map<vscode.WebviewPanel, KiloProvider>,
  attach: (panel: vscode.WebviewPanel) => KiloProvider,
) {
  const panel = vscode.window.createWebviewPanel(
    "kilo-code.new.TabPanel",
    EXTENSION_DISPLAY_NAME,
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [context.extensionUri],
    },
  )

  panel.iconPath = {
    light: vscode.Uri.joinPath(context.extensionUri, "assets", "icons", "kilo-light.png"),
    dark: vscode.Uri.joinPath(context.extensionUri, "assets", "icons", "kilo-dark.png"),
  }

  const tabProvider = attach(panel)

  panel.onDidDispose(
    () => {
      console.log("[Kilo New] Tab panel disposed")
      tabPanels.delete(panel)
      tabProvider.dispose()
    },
    null,
    context.subscriptions,
  )
}

/**
 * Add extension commands to terminal.integrated.commandsToSkipShell so they
 * work when a VS Code terminal has focus. The setting only ships with built-in
 * commands; extension commands must be added explicitly.
 */
function ensureCommandsSkipShell(commands: string[]): void {
  const config = vscode.workspace.getConfiguration("terminal.integrated")
  const info = config.inspect<string[]>("commandsToSkipShell")
  // Update whichever scope already carries an override so we don't
  // shadow workspace settings or leak workspace values into global.
  const [existing, target] = info?.workspaceFolderValue
    ? [info.workspaceFolderValue, vscode.ConfigurationTarget.WorkspaceFolder]
    : info?.workspaceValue
      ? [info.workspaceValue, vscode.ConfigurationTarget.Workspace]
      : [info?.globalValue ?? [], vscode.ConfigurationTarget.Global]
  const missing = commands.filter((cmd) => !existing.includes(cmd))
  if (missing.length === 0) return
  config.update("commandsToSkipShell", [...existing, ...missing], target)
}
