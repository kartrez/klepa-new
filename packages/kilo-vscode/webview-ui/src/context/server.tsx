/**
 * Server connection context
 * Manages connection state to the CLI backend
 */

import { createContext, useContext, createSignal, onMount, onCleanup, ParentComponent, Accessor } from "solid-js"
import { useVSCode } from "./vscode"
import type { ConnectionState, ServerInfo, ProfileData, DeviceAuthState, ExtensionMessage } from "../types/messages"
import { applyFontSize } from "../font-size"

interface ServerContextValue {
  connectionState: Accessor<ConnectionState>
  serverInfo: Accessor<ServerInfo | undefined>
  extensionVersion: Accessor<string | undefined>
  errorMessage: Accessor<string | undefined>
  errorDetails: Accessor<string | undefined>
  isConnected: Accessor<boolean>
  profileData: Accessor<ProfileData | null>
  deviceAuth: Accessor<DeviceAuthState>
  authBusy: Accessor<boolean>
  authError: Accessor<string | undefined>
  gptAuthed: Accessor<boolean>
  balance: Accessor<string | null | undefined>
  balanceBusy: Accessor<boolean>
  refreshBalance: () => void
  startLogin: () => void
  goToLogin: () => void
  vscodeLanguage: Accessor<string | undefined>
  languageOverride: Accessor<string | undefined>
  workspaceDirectory: Accessor<string>
  gitInstalled: Accessor<boolean>
}

export const ServerContext = createContext<ServerContextValue>()

const initialDeviceAuth: DeviceAuthState = { status: "idle" }

type ServerSignals = {
  setServerInfo: (value: ServerInfo | undefined) => void
  setExtensionVersion: (value: string | undefined) => void
  setConnectionState: (value: ConnectionState) => void
  setErrorMessage: (value: string | undefined) => void
  setErrorDetails: (value: string | undefined) => void
  setVscodeLanguage: (value: string | undefined) => void
  setLanguageOverride: (value: string | undefined) => void
  setWorkspaceDirectory: (value: string) => void
  setProfileData: (value: ProfileData | null) => void
  setDeviceAuth: (value: DeviceAuthState) => void
  setAuthBusy: (value: boolean) => void
  setAuthError: (value: string | undefined) => void
  setGptAuthed: (value: boolean) => void
  setBalance: (value: string | null | undefined) => void
  setBalanceBusy: (value: boolean) => void
}

function handleConnectionMessage(message: ExtensionMessage, signals: ServerSignals) {
  if (message.type === "ready") {
    console.log("[Kilo New] Server ready:", message.serverInfo)
    signals.setServerInfo(message.serverInfo)
    if (message.extensionVersion) signals.setExtensionVersion(message.extensionVersion)
    signals.setConnectionState("connected")
    signals.setErrorMessage(undefined)
    signals.setErrorDetails(undefined)
    if (message.vscodeLanguage) signals.setVscodeLanguage(message.vscodeLanguage)
    if (message.languageOverride) signals.setLanguageOverride(message.languageOverride)
    if (message.workspaceDirectory) signals.setWorkspaceDirectory(message.workspaceDirectory)
    return true
  }

  if (message.type === "workspaceDirectoryChanged") {
    signals.setWorkspaceDirectory(message.directory)
    return true
  }

  if (message.type === "languageChanged") {
    signals.setLanguageOverride(message.locale || undefined)
    return true
  }

  if (message.type === "connectionState") {
    console.log("[Kilo New] Connection state changed:", message.state)
    signals.setConnectionState(message.state)
    if (message.error) {
      signals.setErrorMessage(message.userMessage ?? message.error)
      signals.setErrorDetails(message.userDetails ?? message.error)
    } else if (message.state === "connected") {
      signals.setErrorMessage(undefined)
      signals.setErrorDetails(undefined)
    }
    return true
  }

  if (message.type === "error") {
    console.error("[Kilo New] Server error:", message.message)
    signals.setErrorMessage(message.message)
    signals.setErrorDetails(message.message)
    return true
  }

  if (message.type === "profileData") {
    console.log("[Kilo New] Profile data:", message.data ? "received" : "null")
    signals.setProfileData(message.data)
    return true
  }

  if (message.type === "balanceData") {
    signals.setBalanceBusy(false)
    signals.setBalance(message.error ? null : message.balance)
    return true
  }

  return false
}

function handleDeviceAuthMessage(message: ExtensionMessage, signals: ServerSignals) {
  if (message.type === "deviceAuthStarted") {
    console.log("[Kilo New] Device auth started")
    signals.setDeviceAuth({
      status: "pending",
      code: message.code,
      verificationUrl: message.verificationUrl,
      expiresIn: message.expiresIn,
    })
    return true
  }

  if (message.type === "deviceAuthComplete") {
    console.log("[Kilo New] Device auth complete")
    signals.setDeviceAuth({ status: "success" })
    setTimeout(() => signals.setDeviceAuth(initialDeviceAuth), 1500)
    return true
  }

  if (message.type === "deviceAuthFailed") {
    console.log("[Kilo New] Device auth failed:", message.error)
    signals.setDeviceAuth({ status: "error", error: message.error })
    return true
  }

  if (message.type === "deviceAuthCancelled") {
    console.log("[Kilo New] Device auth cancelled")
    signals.setDeviceAuth(initialDeviceAuth)
    return true
  }

  return false
}

function handleGptAuthMessage(message: ExtensionMessage, signals: ServerSignals) {
  if (message.type === "authStarted") {
    signals.setAuthBusy(true)
    signals.setAuthError(undefined)
    return true
  }

  if (message.type === "authComplete") {
    signals.setAuthBusy(false)
    signals.setAuthError(undefined)
    signals.setGptAuthed(true)
    return true
  }

  if (message.type === "authFailed") {
    signals.setAuthBusy(false)
    signals.setAuthError(message.error)
    return true
  }

  if (message.type === "authLoggedOut") {
    signals.setGptAuthed(false)
    signals.setBalance(undefined)
    return true
  }

  return false
}

function handleServerMessage(message: ExtensionMessage, signals: ServerSignals) {
  if (handleConnectionMessage(message, signals)) return
  if (handleDeviceAuthMessage(message, signals)) return
  handleGptAuthMessage(message, signals)
}

export const ServerProvider: ParentComponent = (props) => {
  const vscode = useVSCode()

  const [connectionState, setConnectionState] = createSignal<ConnectionState>("connecting")
  const [serverInfo, setServerInfo] = createSignal<ServerInfo | undefined>()
  const [extensionVersion, setExtensionVersion] = createSignal<string | undefined>()
  const [errorMessage, setErrorMessage] = createSignal<string | undefined>()
  const [errorDetails, setErrorDetails] = createSignal<string | undefined>()
  const [profileData, setProfileData] = createSignal<ProfileData | null>(null)
  const [deviceAuth, setDeviceAuth] = createSignal<DeviceAuthState>(initialDeviceAuth)
  const [authBusy, setAuthBusy] = createSignal(false)
  const [authError, setAuthError] = createSignal<string | undefined>()
  const [gptAuthed, setGptAuthed] = createSignal(false)
  const [balance, setBalance] = createSignal<string | null | undefined>(undefined)
  const [balanceBusy, setBalanceBusy] = createSignal(false)
  const [vscodeLanguage, setVscodeLanguage] = createSignal<string | undefined>()
  const [languageOverride, setLanguageOverride] = createSignal<string | undefined>()
  const [workspaceDirectory, setWorkspaceDirectory] = createSignal<string>("")
  const [gitInstalled, setGitInstalled] = createSignal<boolean>(false)

  const gitSub = vscode.onMessage((m: ExtensionMessage) => {
    if (m.type === "gitStatus") setGitInstalled(m.repo)
  })

  const fontSub = vscode.onMessage((m: ExtensionMessage) => {
    if (m.type === "ready" && m.fontSize !== undefined) applyFontSize(m.fontSize)
    if (m.type === "fontSizeChanged") applyFontSize(m.fontSize)
  })

  onMount(() => {
    const signals: ServerSignals = {
      setServerInfo,
      setExtensionVersion,
      setConnectionState,
      setErrorMessage,
      setErrorDetails,
      setVscodeLanguage,
      setLanguageOverride,
      setWorkspaceDirectory,
      setProfileData,
      setDeviceAuth,
      setAuthBusy,
      setAuthError,
      setGptAuthed,
      setBalance,
      setBalanceBusy,
    }

    const unsubscribe = vscode.onMessage((message: ExtensionMessage) => {
      handleServerMessage(message, signals)
    })

    onCleanup(() => {
      gitSub()
      fontSub()
      unsubscribe()
    })

    // Let the extension know the webview has mounted and message handlers are registered.
    // Without this handshake, messages posted during a webview refresh can be lost.
    console.log("[Kilo New] Webview ready")
    vscode.postMessage({ type: "webviewReady" })
  })

  const startLogin = () => {
    const status = deviceAuth().status
    if (status === "initiating" || status === "pending") {
      return
    }
    setDeviceAuth({ status: "initiating" })
    vscode.postMessage({ type: "login" })
  }

  /**
   * Route any "Sign In" action through the Profile view so the user always
   * sees the device-auth UI (URL, QR, code, timer, cancel). Entry points
   * outside the Profile page — e.g. the Kilo Gateway card in the Providers
   * settings tab, or the provider picker — must call this helper instead of
   * `startLogin()` directly. Otherwise the login flow runs silently and the
   * user has no way to see the code or cancel if the browser is dismissed.
   */
  const refreshBalance = () => {
    if (balanceBusy()) return
    setBalanceBusy(true)
    vscode.postMessage({ type: "refreshBalance" })
  }

  const goToLogin = () => {
    vscode.postMessage({ type: "logout" })
  }

  const value: ServerContextValue = {
    connectionState,
    serverInfo,
    extensionVersion,
    errorMessage,
    errorDetails,
    isConnected: () => connectionState() === "connected",
    profileData,
    deviceAuth,
    authBusy,
    authError,
    gptAuthed,
    balance,
    balanceBusy,
    refreshBalance,
    startLogin,
    goToLogin,
    vscodeLanguage,
    languageOverride,
    workspaceDirectory,
    gitInstalled,
  }

  return <ServerContext.Provider value={value}>{props.children}</ServerContext.Provider>
}

export function useServer(): ServerContextValue {
  const context = useContext(ServerContext)
  if (!context) {
    throw new Error("useServer must be used within a ServerProvider")
  }
  return context
}
