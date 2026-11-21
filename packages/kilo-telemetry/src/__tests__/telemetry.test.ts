import { arch, platform } from "node:os"
import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test"
import { Client } from "../client.js"
import { Identity } from "../identity.js"
import { TelemetryEvent } from "../events.js"
import { Telemetry } from "../telemetry.js"

const ENV_KEYS = [
  "KLEPA_TELEMETRY_URL",
  "KILO_APP_NAME",
  "KILO_APP_VERSION",
  "KILO_PLATFORM",
  "KILO_CLIENT",
  "KILO_VSCODE_VERSION",
  "KILO_TELEMETRY_LEVEL",
  "KILO_TELEMETRY_HOST_DISABLED",
  "DO_NOT_TRACK",
  "KLEPA_ANALYTICS",
] as const

const savedEnv: Record<string, string | undefined> = {}
const originalFetch = globalThis.fetch

interface PostedRequest {
  url: string
  headers: Record<string, string>
  bodyText: string
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

function captureRequests() {
  const sent: PostedRequest[] = []
  globalThis.fetch = Object.assign(
    async (url: string | URL | Request, init?: RequestInit) => {
      const headers: Record<string, string> = {}
      if (init?.headers && typeof init.headers === "object") {
        for (const [k, v] of Object.entries(init.headers as Record<string, string>)) {
          headers[k.toLowerCase()] = v
        }
      }
      const bodyText = typeof init?.body === "string" ? init.body : ""
      sent.push({ url: String(url), headers, bodyText, body: JSON.parse(bodyText) })
      return new Response(null, { status: 204 })
    },
    { preconnect() {} },
  )
  return sent
}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key]
    delete process.env[key]
  }
  Identity.reset()
  Identity.setDataPath("")
})

afterEach(async () => {
  await Telemetry.shutdown(100)
  Identity.reset()
  globalThis.fetch = originalFetch
  for (const key of ENV_KEYS) {
    const val = savedEnv[key]
    if (val === undefined) delete process.env[key]
    else process.env[key] = val
  }
})

describe("Identity", () => {
  test("getDistinctId returns 'unknown' when no machineId set", () => {
    expect(Identity.getDistinctId()).toBe("unknown")
  })

  test("reset clears organizationId and authToken", () => {
    Identity.setOrganizationId("org-123")
    Identity.setAuthToken("token-123")
    expect(Identity.getOrganizationId()).toBe("org-123")
    expect(Identity.getAuthToken()).toBe("token-123")

    Identity.reset()
    expect(Identity.getOrganizationId()).toBeNull()
    expect(Identity.getUserId()).toBeNull()
    expect(Identity.getAuthToken()).toBeNull()
  })

  test("setOrganizationId sets and clears organization ID", () => {
    Identity.setOrganizationId("org-456")
    expect(Identity.getOrganizationId()).toBe("org-456")

    Identity.setOrganizationId(null)
    expect(Identity.getOrganizationId()).toBeNull()
  })
})

describe("TelemetryEvent", () => {
  test("core event constants remain intact for callers", () => {
    expect(String(TelemetryEvent.CLI_START)).toBe("CLI Start")
    expect(String(TelemetryEvent.CLI_EXIT)).toBe("CLI Exit")
    expect(String(TelemetryEvent.SESSION_START)).toBe("Session Start")
    expect(String(TelemetryEvent.LLM_COMPLETION)).toBe("LLM Completion")
    expect(String(TelemetryEvent.TOOL_USED)).toBe("Tool Used")
    expect(String(TelemetryEvent.AGENT_USED)).toBe("Agent Used")
    expect(String(TelemetryEvent.PLAN_FOLLOWUP)).toBe("Plan Followup")
    expect(String(TelemetryEvent.MCP_SERVER_ERROR)).toBe("MCP Server Error")
    expect(String(TelemetryEvent.MCP_AUTH_COMPLETED)).toBe("MCP Auth Completed")
    expect(String(TelemetryEvent.AUTH_SUCCESS)).toBe("Auth Success")
    expect(String(TelemetryEvent.AUTH_LOGOUT)).toBe("Auth Logout")
    expect(String(TelemetryEvent.FEEDBACK_SUBMITTED)).toBe("Feedback Submitted")
    expect(String(TelemetryEvent.ERROR)).toBe("Error")
  })
})

describe("Telemetry Option 1 client & sanitizer", () => {
  test("updates in-memory auth token even when telemetry is disabled", async () => {
    expect(Client.isEnabled()).toBe(false)
    await Telemetry.updateIdentity("sk-disabled-state", "org-a")
    expect(Identity.getAuthToken()).toBe("sk-disabled-state")
    Telemetry.setAuthToken("sk-direct")
    expect(Identity.getAuthToken()).toBe("sk-direct")
  })

  test("maps allowed events, drops disabled-feature events, and enforces feedback rating", async () => {
    const sent = captureRequests()
    process.env.KLEPA_TELEMETRY_URL = "https://telemetry.example.test/api/klepa/telemetry"
    await Telemetry.init({ dataPath: "", version: "0.4.18", enabled: true })

    Telemetry.trackCliStart()
    Telemetry.trackSessionStart("sess-1", "gpt-5", "klepa")
    Telemetry.trackLlmCompletion({
      apiProvider: "klepa",
      modelId: "gpt-5",
      inputTokens: 120,
      outputTokens: 30,
      cacheReadTokens: 10,
      cost: 0.012,
      completionTime: 450,
    })
    Telemetry.trackToolUsed("read_file", "sess-1")
    Telemetry.trackPlanFollowup("sess-1", "continue")
    Telemetry.trackFeedback({ providerID: "klepa", modelID: "gpt-5", rating: "up", messageID: "msg-1" })
    Telemetry.trackMcpAuthCompleted({
      schemaVersion: 1,
      attemptId: "att-1",
      external: false,
      outcome: "denied",
      phase: "authorization",
      oauthOutcome: "failure",
      connectionOutcome: "failed",
      errorCode: "access_denied",
      redirect: true,
      durationMs: 250,
      attribution: "unknown",
    })
    Telemetry.trackError("network_timeout", "auth")
    Telemetry.trackCliExit(0)

    // Unmapped / disabled features must be silently dropped
    Telemetry.trackIndexingStarted({ source: "scan", provider: "kilo", vectorStore: "lancedb" })
    Telemetry.trackMarketplaceItemInstalled({ itemId: "x", itemType: "mcp", target: "global", catalog: "public" })
    Telemetry.trackRemoteConnectionOpened()
    Telemetry.trackShareCreated("sess-1")
    // Feedback without valid rating must be dropped
    Telemetry.track("Feedback Submitted" as TelemetryEvent, { rating: "invalid" })
    // Arbitrary unknown event must be dropped
    Client.capture("Unknown Custom Event")

    await Telemetry.shutdown()

    expect(sent).toHaveLength(1)
    const events = sent[0]!.body.events
    expect(events.map((e) => e.event)).toEqual([
      "app_open",
      "session_start",
      "llm_completion",
      "tool_used",
      "plan_followup",
      "feedback",
      "mcp_auth_completed",
      "error",
      "cli_exit",
    ])
    expect(events[0]!.reference).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(events[1]!.reference).toBe("sess-1")
    expect(events[2]!.props).toMatchObject({
      provider: "klepa",
      model: "gpt-5",
      inputTokens: 120,
      outputTokens: 30,
      cacheReadTokens: 10,
      costUsd: 0.012,
      durationMs: 450,
    })
    expect(events[5]!.rating).toBe("up")
    expect(events[5]!.props).toMatchObject({ provider: "klepa", model: "gpt-5", rating: "up" })
    expect(events[6]!.props).toMatchObject({
      success: false,
      reason: "denied",
      action: "authorization",
      errorCode: "access_denied",
    })
    expect(events[7]!.props).toMatchObject({ errorType: "network_timeout", source: "auth" })
    expect(events[8]!.props?.exitCode).toBe(0)
  })

  test("strips private/unlisted props, truncates long strings, caps at 20 props, and sends VSCode headers", async () => {
    const sent = captureRequests()
    process.env.KLEPA_TELEMETRY_URL = "https://telemetry.example.test/api/klepa/telemetry"
    process.env.KILO_PLATFORM = "vscode"
    process.env.KILO_APP_NAME = "klepa-vscode"
    process.env.KILO_APP_VERSION = "0.5.0"
    process.env.KILO_VSCODE_VERSION = "1.99.2"

    Telemetry.setAuthToken("sk-secret-key")
    await Telemetry.init({ dataPath: "", version: "0.0.1", enabled: true })

    Telemetry.track(TelemetryEvent.TOOL_USED, {
      tool: "write_file",
      sessionId: "private-session-id",
      prompt: "do not leak user prompt",
      path: "C:\\Users\\secret\\file.ts",
      email: "user@example.com",
      aauClientToken: "conda-token",
      $set: { admin: true },
      nested: { deep: 1 },
      nanVal: Number.NaN,
      reason: "x".repeat(600),
      provider: "p1",
      model: "m1",
      agent: "a1",
      statusCode: 200,
      errorCode: "E0",
      errorType: "none",
      durationMs: 10,
      inputTokens: 1,
      outputTokens: 2,
      reasoningTokens: 3,
      cacheReadTokens: 4,
      cacheWriteTokens: 5,
      costUsd: 0.1,
      exitCode: 0,
      feature: "f1",
      action: "run",
      source: "src",
      rating: "up",
      success: true,
      transport: "stdio",
      serverName: "pw",
      variant: "v1",
      choice: "c1",
    })

    await Telemetry.shutdown()

    expect(sent).toHaveLength(1)
    expect(sent[0]!.headers.authorization).toBe("Bearer sk-secret-key")
    expect(sent[0]!.headers["x-traffic-source"]).toBe("Klepa-VSCode v-0.5.0")
    expect(sent[0]!.body.client).toBe("vscode")
    expect(sent[0]!.body.appVersion).toBe("0.5.0")

    const props = sent[0]!.body.events[0]!.props!
    expect(Object.keys(props).length).toBeLessThanOrEqual(20)
    expect(props.tool).toBe("write_file")
    expect((props.reason as string).length).toBe(512)
    expect(props).not.toHaveProperty("sessionId")
    expect(props).not.toHaveProperty("prompt")
    expect(props).not.toHaveProperty("path")
    expect(props).not.toHaveProperty("email")
    expect(props).not.toHaveProperty("aauClientToken")
    expect(props).not.toHaveProperty("$set")
    expect(props).not.toHaveProperty("nested")
    expect(props).not.toHaveProperty("nanVal")
  })

  test("omits Authorization header when anonymous and caps queue at 200 + splits batches to <= 50 events and <= 32 KB", async () => {
    const sent = captureRequests()
    process.env.KLEPA_TELEMETRY_URL = "https://telemetry.example.test/api/klepa/telemetry"
    await Telemetry.init({ dataPath: "", version: "0.4.18", enabled: true })

    // Enqueue 205 events via Client.capture directly (avoiding auto background timer firing before cap check)
    for (let i = 0; i < 205; i++) {
      Client.capture(TelemetryEvent.TOOL_USED, {
        tool: `t-${i}`,
        reason: "a".repeat(450),
        source: "b".repeat(450),
      })
    }
    expect(Client.getQueueSize()).toBe(200)

    await Client.flush(5000)

    expect(sent.length).toBeGreaterThan(4)
    let totalSent = 0
    for (const req of sent) {
      expect(req.headers.authorization).toBeUndefined()
      expect(req.body.events.length).toBeLessThanOrEqual(50)
      expect(Buffer.byteLength(req.bodyText, "utf8")).toBeLessThanOrEqual(32_768)
      totalSent += req.body.events.length
    }
    expect(totalSent).toBe(200)
    // Oldest 5 events (t-0..t-4) were evicted; first surviving event is t-5
    expect(sent[0]!.body.events[0]!.props?.tool).toBe("t-5")
  })

  test("honors DO_NOT_TRACK, KLEPA_ANALYTICS, and KILO_TELEMETRY_LEVEL opt-outs", () => {
    expect(Telemetry.level(true)).toBe(true)
    expect(Telemetry.level(false)).toBe(false)

    process.env.DO_NOT_TRACK = "1"
    expect(Telemetry.level(true)).toBe(false)
    process.env.DO_NOT_TRACK = "true"
    expect(Telemetry.level(true)).toBe(false)
    delete process.env.DO_NOT_TRACK

    process.env.KLEPA_ANALYTICS = "0"
    expect(Telemetry.level(true)).toBe(false)
    process.env.KLEPA_ANALYTICS = "false"
    expect(Telemetry.level(true)).toBe(false)
    delete process.env.KLEPA_ANALYTICS

    process.env.KILO_TELEMETRY_LEVEL = "off"
    expect(Telemetry.level(true)).toBe(false)
  })

  test("includes host OS properties on Client.capture", () => {
    const capture = spyOn(Client, "capture").mockImplementation(() => {})
    try {
      Telemetry.track(TelemetryEvent.CLI_START)
      expect(capture).toHaveBeenCalledWith(
        TelemetryEvent.CLI_START,
        expect.objectContaining({
          os_name: platform(),
          os_arch: arch(),
        }),
      )
    } finally {
      capture.mockRestore()
    }
  })
})
