import { afterEach, describe, expect, test } from "bun:test"
import * as vscode from "vscode"
import { EXTENSION_ID, EXTENSION_LOGIN_PATH } from "../../src/shared/gpt-chat-by"
import {
  AUTH_CANCELLED,
  cancelTelegramAuth,
  completeTelegramAuth,
  isAuthCallbackPath,
  parseAuthCallback,
  resetSessionFetch,
  sessionPoll,
  setSessionFetch,
  startTelegramAuth,
} from "../../src/kilo-provider/handlers/gpt-chat-by-auth"

describe("gpt-chat-by auth", () => {
  const defaultIntervalMs = sessionPoll.intervalMs

  afterEach(() => {
    sessionPoll.intervalMs = defaultIntervalMs
    resetSessionFetch()
  })

  test("parseAuthCallback reads token and state", () => {
    const uri = vscode.Uri.parse(`vscode://${EXTENSION_ID}${EXTENSION_LOGIN_PATH}?state=abc&token=secret`)
    expect(parseAuthCallback(uri)).toEqual({ token: "secret", state: "abc" })
  })

  test("parseAuthCallback supports api_key param", () => {
    const uri = vscode.Uri.parse(`vscode://${EXTENSION_ID}${EXTENSION_LOGIN_PATH}?state=abc&api_key=secret`)
    expect(parseAuthCallback(uri)).toEqual({ token: "secret", state: "abc" })
  })

  test("isAuthCallbackPath accepts loginhook routes", () => {
    expect(isAuthCallbackPath(EXTENSION_LOGIN_PATH)).toBe(true)
    expect(isAuthCallbackPath(`${EXTENSION_LOGIN_PATH}/`)).toBe(true)
  })

  test("completeTelegramAuth resolves pending login with state", async () => {
    let state = ""
    const pending = startTelegramAuth((url) => {
      state = new URL(url).searchParams.get("state") ?? ""
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const ok = completeTelegramAuth(state, "secret-token")
    expect(ok).toBe(true)
    await expect(pending).resolves.toBe("secret-token")
  })

  test("completeTelegramAuth resolves pending login without state", async () => {
    const pending = startTelegramAuth(() => {})
    await new Promise((resolve) => setTimeout(resolve, 0))
    const ok = completeTelegramAuth(null, "secret-token")
    expect(ok).toBe(true)
    await expect(pending).resolves.toBe("secret-token")
  })

  test("completeTelegramAuth rejects unknown state", () => {
    expect(completeTelegramAuth("missing", "token")).toBe(false)
  })

  test("startTelegramAuth resolves via session polling", async () => {
    sessionPoll.intervalMs = 5
    setSessionFetch(async () => ({ status: "ready", token: "gb-key" }))

    const pending = startTelegramAuth(() => {})
    await expect(pending).resolves.toBe("gb-key")
  })

  test("polling does not fire after deep-link resolves first", async () => {
    sessionPoll.intervalMs = 5
    let fetchCount = 0
    setSessionFetch(async () => {
      fetchCount += 1
      return { status: "pending", token: null }
    })

    let state = ""
    const pending = startTelegramAuth((url) => {
      state = new URL(url).searchParams.get("state") ?? ""
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    completeTelegramAuth(state, "deep-link-token")
    await expect(pending).resolves.toBe("deep-link-token")
    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(fetchCount).toBe(0)
  })

  test("second completeTelegramAuth does not override the first token", async () => {
    sessionPoll.intervalMs = 5
    setSessionFetch(async () => ({ status: "pending", token: null }))

    let state = ""
    const pending = startTelegramAuth((url) => {
      state = new URL(url).searchParams.get("state") ?? ""
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(completeTelegramAuth(state, "first-token")).toBe(true)
    expect(completeTelegramAuth(state, "second-token")).toBe(false)
    await expect(pending).resolves.toBe("first-token")
  })

  test("deep-link after polling resolve is ignored", async () => {
    sessionPoll.intervalMs = 5
    setSessionFetch(async () => ({ status: "ready", token: "poll-token" }))

    let state = ""
    const pending = startTelegramAuth((url) => {
      state = new URL(url).searchParams.get("state") ?? ""
    })
    await expect(pending).resolves.toBe("poll-token")
    expect(completeTelegramAuth(state, "deep-link-token")).toBe(false)
  })

  test("cancelTelegramAuth rejects the waiting site login", async () => {
    sessionPoll.intervalMs = 5
    setSessionFetch(async () => ({ status: "pending", token: null }))
    const pending = startTelegramAuth(() => {})
    await new Promise((resolve) => setTimeout(resolve, 0))
    cancelTelegramAuth()
    await expect(pending).rejects.toThrow(AUTH_CANCELLED)
  })
})
