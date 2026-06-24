import type { KiloClient } from "@kilocode/sdk/v2/client"
import { GPT_CHAT_BY_API_BASE, GPT_CHAT_BY_PROVIDER_ID } from "../../shared/gpt-chat-by"
import type { StoredProviderKey } from "../../provider-actions"

const klepaIds = new Set([GPT_CHAT_BY_PROVIDER_ID, "gpt-chat-by"])

export async function resolveKlepaToken(
  client: KiloClient,
  keys: Record<string, StoredProviderKey>,
  dir: string,
) {
  const stored = keys[GPT_CHAT_BY_PROVIDER_ID]
  if (stored?.key) return stored.key

  const { data } = await client.provider.list({ directory: dir }, { throwOnError: true })
  for (const item of data?.all ?? []) {
    const raw = item as Record<string, unknown>
    if (typeof raw.id !== "string" || !klepaIds.has(raw.id)) continue
    if (typeof raw.key === "string" && raw.key) return raw.key
  }
  return null
}

export async function fetchKlepaBalance(token: string | null | undefined) {
  if (!token) return null

  const url = new URL("copy-code/balance", GPT_CHAT_BY_API_BASE)
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  })
  if (!res.ok) throw new Error(`Balance request failed (${res.status})`)

  const data = (await res.json()) as { balance?: string | number }
  if (data.balance === undefined || data.balance === null) return null
  return String(data.balance)
}

export type KlepaTopUpSupply = "API_BALANCE" | "COPI_CODE_SUBSCRIBE" | "COPI_CODE_SUBSCRIBE_YEAR"

export async function fetchKlepaTopUp(
  token: string,
  supply: KlepaTopUpSupply,
  amount?: number,
) {
  const url = new URL("copy-code/balance/top-up", GPT_CHAT_BY_API_BASE)
  url.searchParams.set("supply", supply)
  if (amount !== undefined) url.searchParams.set("amount", String(amount))

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  })
  if (!res.ok) throw new Error(`Top-up request failed (${res.status})`)

  const data = (await res.json()) as { url?: string }
  if (!data.url) throw new Error("Missing payment URL")
  return data.url
}
