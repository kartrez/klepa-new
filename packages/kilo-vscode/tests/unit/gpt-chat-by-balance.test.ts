import { describe, expect, test, mock, afterEach } from "bun:test"
import { GPT_CHAT_BY_API_BASE, GPT_CHAT_BY_PROVIDER_ID } from "../../src/shared/gpt-chat-by"
import { fetchKlepaBalance, resolveKlepaToken } from "../../src/kilo-provider/handlers/gpt-chat-by-balance"

describe("fetchKlepaBalance", () => {
  const original = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = original
  })

  test("returns null without token", async () => {
    const balance = await fetchKlepaBalance(null)
    expect(balance).toBeNull()
  })

  test("fetches balance with bearer token", async () => {
    let url = ""
    let auth = ""
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      url = String(input)
      auth = String(init?.headers && (init.headers as Record<string, string>).Authorization)
      return new Response(JSON.stringify({ balance: "15.50" }), { status: 200 })
    }) as typeof fetch

    const balance = await fetchKlepaBalance("secret-key")

    expect(balance).toBe("15.50")
    expect(url).toBe(`${GPT_CHAT_BY_API_BASE}copy-code/balance`)
    expect(auth).toBe("Bearer secret-key")
  })

  test("coerces numeric balance", async () => {
    globalThis.fetch = mock(async () => new Response(JSON.stringify({ balance: 9.5 }), { status: 200 })) as typeof fetch
    const balance = await fetchKlepaBalance("token")
    expect(balance).toBe("9.5")
  })

  test("throws on non-200 response", async () => {
    globalThis.fetch = mock(async () => new Response("", { status: 401 })) as typeof fetch
    await expect(fetchKlepaBalance("bad")).rejects.toThrow("Balance request failed (401)")
  })
})

describe("resolveKlepaToken", () => {
  test("reads stored key", async () => {
    const token = await resolveKlepaToken(
      { provider: { list: async () => ({ data: { all: [] } }) } } as never,
      { [GPT_CHAT_BY_PROVIDER_ID]: { key: "stored", baseURL: GPT_CHAT_BY_API_BASE } },
      "/project",
    )
    expect(token).toBe("stored")
  })

  test("falls back to provider list", async () => {
    const client = {
      provider: {
        list: async () => ({
          data: {
            all: [{ id: GPT_CHAT_BY_PROVIDER_ID, key: "from-list" }],
          },
        }),
      },
    } as never

    const token = await resolveKlepaToken(client, {}, "/project")
    expect(token).toBe("from-list")
  })
})
