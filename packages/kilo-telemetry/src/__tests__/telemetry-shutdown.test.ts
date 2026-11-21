import { describe, test, expect } from "bun:test"
import { Client } from "../client.js"
import { Telemetry } from "../telemetry.js"

describe("Telemetry.shutdown timeout (#9788)", () => {
  test("aborts slow HTTP uploads within timeoutMs without throwing or blocking", async () => {
    const originalFetch = globalThis.fetch
    let aborted = false
    globalThis.fetch = Object.assign(
      async (_input: string | URL | Request, init?: RequestInit) => {
        return await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            aborted = true
            reject(new DOMException("Aborted", "AbortError"))
          })
        })
      },
      { preconnect() {} },
    )

    try {
      await Telemetry.init({ dataPath: "", version: "1.0.0", enabled: true })
      Telemetry.trackCliStart()

      const started = Date.now()
      await expect(Telemetry.shutdown(50)).resolves.toBeUndefined()
      expect(Date.now() - started).toBeLessThan(1500)
      expect(aborted).toBe(true)
      expect(Client.isEnabled()).toBe(false)
      expect(Client.getQueueSize()).toBe(0)
    } finally {
      globalThis.fetch = originalFetch
      await Telemetry.shutdown(50)
    }
  })

  test("a new client initializes and shuts down normally after the timeout test", async () => {
    await Telemetry.init({ dataPath: "", version: "1.0.0", enabled: true })
    expect(Client.isEnabled()).toBe(true)
    await Telemetry.shutdown()
    expect(Client.isEnabled()).toBe(false)
  })
})
