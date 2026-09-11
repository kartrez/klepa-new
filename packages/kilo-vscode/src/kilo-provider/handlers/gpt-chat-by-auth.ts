import { randomBytes } from "crypto"
import * as vscode from "vscode"
import type { KiloClient } from "@kilocode/sdk/v2/client"
import {
  EXTENSION_ID,
  EXTENSION_LOGIN_PATH,
  GPT_CHAT_BY_API_BASE,
  GPT_CHAT_BY_AUTH_URL,
  GPT_CHAT_BY_PROVIDER_ID,
} from "../../shared/gpt-chat-by"

const pending = new Map<string, { resolve: (token: string) => void; reject: (err: Error) => void }>()
let active: { resolve: (token: string) => void; reject: (err: Error) => void } | undefined

const tokenKeys = ["token", "api_key", "apiKey", "access_token", "key"] as const

// Опрос одноразовой сессии vscode-auth: сайт публикует ключ по state, плагин забирает его
// без deep-link (Qoder 1.29.0 отклоняет сторонние qoder:// маршруты). Интервал и fetch
// вынесены наружу, чтобы юнит-тесты не ходили в сеть.
export const sessionPoll = {
  intervalMs: 2_000,
  timeoutMs: 900_000,
}

type SessionStatus = { status: string; token: string | null }

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function defaultFetchSession(state: string): Promise<SessionStatus> {
  const url = new URL(`vscode-auth/session/${state}`, GPT_CHAT_BY_API_BASE)
  try {
    const response = await fetch(url)
    if (!response.ok) return { status: "pending", token: null }
    return (await response.json()) as SessionStatus
  } catch (err) {
    console.error("[Kilo New] vscode-auth session poll failed:", err)
    return { status: "pending", token: null }
  }
}

let fetchSession: (state: string) => Promise<SessionStatus> = defaultFetchSession

export function setSessionFetch(next: (state: string) => Promise<SessionStatus>) {
  fetchSession = next
}

export function resetSessionFetch() {
  fetchSession = defaultFetchSession
}

export function createAuthState() {
  return randomBytes(16).toString("hex")
}

export function parseAuthCallback(uri: vscode.Uri) {
  const params = new URLSearchParams(uri.query)
  const state = params.get("state")
  const token = tokenKeys.map((key) => params.get(key)).find((value) => value && value.trim() !== "") ?? null
  return { token, state }
}

export function isAuthCallbackPath(path: string) {
  const norm = path.replace(/\/+$/, "") || "/"
  return norm === EXTENSION_LOGIN_PATH || norm.endsWith(EXTENSION_LOGIN_PATH)
}

export async function buildRedirectUri() {
  const uri = await vscode.env.asExternalUri(
    vscode.Uri.parse(`${vscode.env.uriScheme}://${EXTENSION_ID}${EXTENSION_LOGIN_PATH}`),
  )
  return uri.toString()
}

export async function startTelegramAuth(open: (url: string) => void): Promise<string> {
  const state = createAuthState()
  const redirect = await buildRedirectUri()
  const url = new URL(GPT_CHAT_BY_AUTH_URL)
  url.searchParams.set("redirect_uri", redirect)
  url.searchParams.set("state", state)
  open(url.toString())

  const promise = new Promise<string>((resolve, reject) => {
    active = { resolve, reject }
    pending.set(state, { resolve, reject })
    setTimeout(() => {
      if (!pending.has(state)) return
      pending.delete(state)
      if (active?.resolve === resolve) active = undefined
      reject(new Error("Login timed out"))
    }, sessionPoll.timeoutMs)
  })

  // Параллельно с deep-link: кто первый — deep-link или опрос — тот и завершает вход.
  void pollSession(state, promise)
  return promise
}

async function pollSession(state: string, promise: Promise<string>): Promise<void> {
  let settled = false
  promise.then(
    () => {
      settled = true
    },
    () => {
      settled = true
    },
  )

  const deadline = Date.now() + sessionPoll.timeoutMs
  while (!settled && Date.now() < deadline) {
    await wait(sessionPoll.intervalMs)
    if (settled || Date.now() >= deadline) return
    const body = await fetchSession(state)
    // Выигрышный GET отдаёт token; статус ready (как у claim) или иной — не важен.
    if (body.token) {
      completeTelegramAuth(state, body.token)
      return
    }
  }
}

export function completeTelegramAuth(state: string | null, token: string | null): boolean {
  if (!token) return false
  if (state) {
    const entry = pending.get(state)
    if (!entry) return false
    pending.delete(state)
    if (active?.resolve === entry.resolve) active = undefined
    entry.resolve(token)
    return true
  }
  const entry = active
  if (!entry) return false
  active = undefined
  pending.clear()
  entry.resolve(token)
  return true
}

export const AUTH_CANCELLED = "Login cancelled"

export function cancelTelegramAuth(state?: string) {
  if (state) {
    const entry = pending.get(state)
    if (!entry) return
    pending.delete(state)
    if (active?.resolve === entry.resolve) active = undefined
    entry.reject(new Error(AUTH_CANCELLED))
    return
  }
  for (const entry of pending.values()) {
    entry.reject(new Error(AUTH_CANCELLED))
  }
  pending.clear()
  if (active) {
    active.reject(new Error(AUTH_CANCELLED))
    active = undefined
  }
}

export async function saveToken(client: KiloClient, token: string) {
  await client.auth.set(
    {
      providerID: GPT_CHAT_BY_PROVIDER_ID,
      auth: { type: "api", key: token },
    },
    { throwOnError: true },
  )
}
