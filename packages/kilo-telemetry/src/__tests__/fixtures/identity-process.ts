export {}

interface CapturedRequest {
  url: string
  headers: Record<string, string>
  body: {
    client: "vscode" | "cli"
    installationId?: string
    appVersion?: string
    events: Array<{
      event: string
      reference: string
      occurredAt: string
      rating?: string
      props?: Record<string, unknown>
    }>
  }
}

const requests: CapturedRequest[] = []
globalThis.fetch = Object.assign(
  async (url: string | URL | Request, options?: RequestInit) => {
    if (typeof options?.body !== "string") throw new Error("Expected a JSON telemetry batch")
    const headers: Record<string, string> = {}
    if (options.headers && typeof options.headers === "object") {
      for (const [k, v] of Object.entries(options.headers as Record<string, string>)) {
        headers[k.toLowerCase()] = v
      }
    }
    requests.push({
      url: String(url),
      headers,
      body: JSON.parse(options.body),
    })
    return new Response(null, { status: process.env.TEST_FAIL ? 400 : 204 })
  },
  { preconnect() {} },
)

const { Telemetry } = await import("../../telemetry.js")

const enabled = process.env.TEST_CONFIG_ENABLED !== "0"
await Telemetry.init({
  dataPath: process.env.TEST_DATA!,
  version: process.env.TEST_VERSION ?? "1.0.0",
  enabled,
})
if (process.env.TEST_HOST_ENABLED) Telemetry.setHostEnabled(true, enabled)
if (process.env.TEST_RUNTIME_ENABLED) Telemetry.setEnabled(true)
if (process.env.TEST_LOGIN) Telemetry.trackCliStart()
await Telemetry.updateIdentity("test-token", process.env.TEST_ORG)
if (process.env.TEST_LOGIN) {
  Telemetry.trackAuthSuccess("klepa")
  Telemetry.trackCliExit(0)
} else {
  Telemetry.trackCliStart()
}
await Telemetry.shutdown(1000)
console.log(JSON.stringify(requests))
process.exit(0)
