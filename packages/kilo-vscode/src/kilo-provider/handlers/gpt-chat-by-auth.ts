import { randomBytes } from "crypto"
import * as vscode from "vscode"
import type { KiloClient } from "@kilocode/sdk/v2/client"
import {
  EXTENSION_ID,
  EXTENSION_LOGIN_PATH,
  GPT_CHAT_BY_AUTH_URL,
  GPT_CHAT_BY_PROVIDER_ID,
} from "../../shared/gpt-chat-by"

const pending = new Map<string, { resolve: (token: string) => void; reject: (err: Error) => void }>()
let active: { resolve: (token: string) => void; reject: (err: Error) => void } | undefined

const tokenKeys = ["token", "api_key", "apiKey", "access_token", "key"] as const

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
  return new Promise((resolve, reject) => {
    active = { resolve, reject }
    pending.set(state, { resolve, reject })
    setTimeout(() => {
      if (!pending.has(state)) return
      pending.delete(state)
      if (active?.resolve === resolve) active = undefined
      reject(new Error("Login timed out"))
    }, 900_000)
  })
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

export function cancelTelegramAuth(state: string) {
  const entry = pending.get(state)
  if (!entry) return
  pending.delete(state)
  if (active?.resolve === entry.resolve) active = undefined
  entry.reject(new Error("Login cancelled"))
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
