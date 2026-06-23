import { describe, expect, test } from "bun:test"
import * as vscode from "vscode"
import { EXTENSION_ID, EXTENSION_LOGIN_PATH } from "../../src/shared/gpt-chat-by"
import {
  completeTelegramAuth,
  isAuthCallbackPath,
  parseAuthCallback,
  startTelegramAuth,
} from "../../src/kilo-provider/handlers/gpt-chat-by-auth"

describe("gpt-chat-by auth", () => {
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
})
