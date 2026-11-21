import { Identity } from "./identity.js"
import { TelemetryEvent } from "./events.js"

export type KlepaClientType = "vscode" | "cli"
export type KlepaFeedbackRating = "up" | "down" | "cleared"
export type KlepaScalar = string | number | boolean | null

export type KlepaEventName =
  | "app_open"
  | "auth_success"
  | "auth_logout"
  | "session_start"
  | "response_success"
  | "llm_completion"
  | "tool_used"
  | "agent_used"
  | "plan_followup"
  | "feedback"
  | "feature_used"
  | "error"
  | "llm_error"
  | "mcp_server_error"
  | "mcp_auth_completed"
  | "agent_manager_error"
  | "cli_exit"

export interface KlepaClientMeta {
  client: KlepaClientType
  appVersion?: string
  os?: string
  arch?: string
  editorVersion?: string
}

export interface QueuedTelemetryEvent {
  event: KlepaEventName
  reference: string
  occurredAt: string
  rating?: KlepaFeedbackRating
  props?: Record<string, KlepaScalar>
}

export interface TelemetryBatchPayload {
  client: KlepaClientType
  installationId: string
  appVersion?: string
  events: QueuedTelemetryEvent[]
}

interface EventMapping {
  name: KlepaEventName
  defaults?: Record<string, KlepaScalar>
  feedback?: boolean
  mcpAuthCompleted?: boolean
}

const DEFAULT_ENDPOINT = "https://api.gpt-chat.by/api/klepa/telemetry"
const MAX_QUEUE = 200
const FLUSH_THRESHOLD = 25
const FLUSH_INTERVAL_MS = 20_000
const MAX_BATCH_EVENTS = 50
const MAX_BODY_BYTES = 32_768
const MAX_PROPS = 20
const MAX_PROP_CHARS = 512
const APP_VERSION_RE = /^[a-zA-Z0-9.+_-]{1,32}$/
const REFERENCE_RE = /^[a-zA-Z0-9._:-]{1,128}$/
const VALID_RATINGS = new Set<KlepaFeedbackRating>(["up", "down", "cleared"])

const ALLOWED_PROPS = new Set<string>([
  "provider",
  "model",
  "agent",
  "tool",
  "statusCode",
  "errorCode",
  "errorType",
  "durationMs",
  "inputTokens",
  "outputTokens",
  "reasoningTokens",
  "cacheReadTokens",
  "cacheWriteTokens",
  "costUsd",
  "exitCode",
  "os",
  "arch",
  "editorVersion",
  "feature",
  "action",
  "source",
  "rating",
  "success",
  "transport",
  "serverName",
  "reason",
  "variant",
  "choice",
])

const PROP_ALIASES: Record<string, string> = {
  apiProvider: "provider",
  providerID: "provider",
  modelId: "model",
  modelID: "model",
  duration: "durationMs",
  completionTime: "durationMs",
  cost: "costUsd",
  os_name: "os",
  os_arch: "arch",
  vscodeVersion: "editorVersion",
  error: "errorType",
  context: "source",
  server: "serverName",
  command: "action",
}

const EVENT_MAP: Record<string, EventMapping> = {
  [TelemetryEvent.CLI_START]: { name: "app_open" },
  [TelemetryEvent.CLI_EXIT]: { name: "cli_exit" },
  [TelemetryEvent.AUTH_SUCCESS]: { name: "auth_success" },
  "Account Connect Success": { name: "auth_success" },
  [TelemetryEvent.AUTH_LOGOUT]: { name: "auth_logout" },
  "Account Logout Success": { name: "auth_logout" },
  [TelemetryEvent.SESSION_START]: { name: "session_start" },
  "Task Created": { name: "session_start" },
  "Task Reopened": { name: "session_start" },
  "Task Completed": { name: "response_success" },
  [TelemetryEvent.LLM_COMPLETION]: { name: "llm_completion" },
  [TelemetryEvent.TOOL_USED]: { name: "tool_used" },
  [TelemetryEvent.AGENT_USED]: { name: "agent_used" },
  "Mode Switched": { name: "agent_used" },
  [TelemetryEvent.PLAN_FOLLOWUP]: { name: "plan_followup" },
  [TelemetryEvent.FEEDBACK_SUBMITTED]: { name: "feedback", feedback: true },
  [TelemetryEvent.COMMAND_USED]: { name: "feature_used", defaults: { feature: "command" } },
  "Code Action Used": { name: "feature_used", defaults: { feature: "code_action" } },
  "Prompt Enhanced": { name: "feature_used", defaults: { feature: "prompt_enhance" } },
  "Commit Message Generated": { name: "feature_used", defaults: { feature: "commit_message" } },
  "Agent Manager Opened": { name: "feature_used", defaults: { feature: "agent_manager", action: "open" } },
  "Agent Manager Session Started": {
    name: "feature_used",
    defaults: { feature: "agent_manager", action: "session_start" },
  },
  "Agent Manager Session Completed": {
    name: "feature_used",
    defaults: { feature: "agent_manager", action: "session_complete" },
  },
  "Checkpoint Created": { name: "feature_used", defaults: { feature: "checkpoint", action: "create" } },
  "Checkpoint Restored": { name: "feature_used", defaults: { feature: "checkpoint", action: "restore" } },
  "Context Condensed": { name: "feature_used", defaults: { feature: "context_condense" } },
  [TelemetryEvent.ERROR]: { name: "error", defaults: { errorType: "error" } },
  "Schema Validation Error": { name: "error", defaults: { errorType: "schema_validation" } },
  "Diff Application Error": { name: "error", defaults: { errorType: "diff_application" } },
  "Shell Integration Error": { name: "error", defaults: { errorType: "shell_integration" } },
  "Consecutive Mistake Error": { name: "error", defaults: { errorType: "consecutive_mistake" } },
  [TelemetryEvent.MCP_SERVER_ERROR]: { name: "mcp_server_error" },
  [TelemetryEvent.MCP_AUTH_COMPLETED]: { name: "mcp_auth_completed", mcpAuthCompleted: true },
  "Agent Manager Session Error": { name: "agent_manager_error", defaults: { errorType: "session_error" } },
  "Agent Manager Login Issue": { name: "agent_manager_error", defaults: { errorType: "login_issue" } },
}

function truncateCodePoints(value: string, max = MAX_PROP_CHARS): string {
  const chars = Array.from(value)
  return chars.length <= max ? value : chars.slice(0, max).join("")
}

function sanitizeScalar(value: unknown): KlepaScalar | undefined {
  if (value === null) return null
  if (typeof value === "boolean") return value
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined
  if (typeof value === "string") return truncateCodePoints(value, MAX_PROP_CHARS)
  return undefined
}

function sanitizeReferenceSegment(value: unknown): string {
  if (typeof value !== "string") return ""
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._:-]/g, "_")
    .slice(0, 118)
}

function buildReference(eventName: KlepaEventName, occurredAt: string, properties?: Record<string, unknown>): string {
  if (eventName === "app_open") {
    return occurredAt.slice(0, 10)
  }

  if (eventName === "session_start") {
    const raw = sanitizeReferenceSegment(properties?.sessionId ?? properties?.sessionID ?? properties?.taskId)
    if (raw && REFERENCE_RE.test(raw)) return raw
    return crypto.randomUUID()
  }

  const raw = sanitizeReferenceSegment(
    properties?.messageID ??
      properties?.requestId ??
      properties?.attemptId ??
      properties?.sessionId ??
      properties?.sessionID ??
      properties?.taskId,
  )
  const suffix = crypto.randomUUID().slice(0, 8)
  if (raw) {
    const candidate = `${raw}:${suffix}`.slice(0, 128)
    if (REFERENCE_RE.test(candidate)) return candidate
  }
  return crypto.randomUUID()
}

function sanitizeProps(
  raw: Record<string, unknown> | undefined,
  meta: KlepaClientMeta,
  mapping: EventMapping,
): Record<string, KlepaScalar> | undefined {
  const out: Record<string, KlepaScalar> = {}

  const put = (key: string, val: unknown) => {
    if (!ALLOWED_PROPS.has(key)) return
    const scalar = sanitizeScalar(val)
    if (scalar === undefined) return
    out[key] = scalar
  }

  if (raw) {
    // Apply aliases first so canonical property keys take precedence when both are present.
    for (const [key, value] of Object.entries(raw)) {
      const mapped = PROP_ALIASES[key]
      if (mapped && raw[mapped] === undefined) {
        put(mapped, value)
      }
    }
    for (const [key, value] of Object.entries(raw)) {
      put(key, value)
    }

    if (mapping.mcpAuthCompleted) {
      if (typeof raw.outcome === "string") {
        if (out.success === undefined) put("success", raw.outcome === "success")
        if (raw.outcome !== "success" && out.reason === undefined) put("reason", raw.outcome)
      }
      if (typeof raw.phase === "string" && out.action === undefined) {
        put("action", raw.phase)
      }
    }
  }

  if (mapping.defaults) {
    for (const [key, value] of Object.entries(mapping.defaults)) {
      if (out[key] === undefined) put(key, value)
    }
  }

  if (meta.os && out.os === undefined) put("os", meta.os)
  if (meta.arch && out.arch === undefined) put("arch", meta.arch)
  if (meta.editorVersion && out.editorVersion === undefined) put("editorVersion", meta.editorVersion)

  const entries = Object.entries(out).slice(0, MAX_PROPS)
  if (entries.length === 0) return undefined
  return Object.fromEntries(entries)
}

function sanitizeAppVersion(version?: string): string | undefined {
  const trimmed = version?.trim()
  if (!trimmed) return undefined
  return APP_VERSION_RE.test(trimmed) ? trimmed : undefined
}

export namespace Client {
  let active = false
  let enabled = true
  let meta: KlepaClientMeta = {
    client: "cli",
    os: process.platform,
    arch: process.arch,
  }
  const queue: QueuedTelemetryEvent[] = []
  let intervalTimer: ReturnType<typeof setInterval> | null = null
  let bgTimer: ReturnType<typeof setTimeout> | null = null
  let flushing: Promise<void> | null = null

  function getEndpoint(): string {
    const configured = process.env.KLEPA_TELEMETRY_URL?.trim()
    return configured && configured.length > 0 ? configured : DEFAULT_ENDPOINT
  }

  function clearTimers() {
    if (bgTimer) {
      clearTimeout(bgTimer)
      bgTimer = null
    }
    if (intervalTimer) {
      clearInterval(intervalTimer)
      intervalTimer = null
    }
  }

  function startInterval() {
    if (intervalTimer || !active || !enabled) return
    intervalTimer = setInterval(() => {
      void flush()
    }, FLUSH_INTERVAL_MS)
    intervalTimer.unref?.()
  }

  export function init(_dir = "") {
    clearTimers()
    queue.length = 0
    active = true
    if (enabled) startInterval()
  }

  export function setMeta(next: KlepaClientMeta) {
    meta = {
      client: next.client === "vscode" ? "vscode" : "cli",
      appVersion: next.appVersion,
      os: next.os ?? meta.os,
      arch: next.arch ?? meta.arch,
      editorVersion: next.editorVersion,
    }
  }

  export function setEnabled(value: boolean) {
    enabled = value
    if (!value) {
      queue.length = 0
      clearTimers()
      return
    }
    if (active) startInterval()
  }

  export function isEnabled(): boolean {
    return enabled && active
  }

  export function getQueueSize(): number {
    return queue.length
  }

  export function capture(event: TelemetryEvent | string, properties?: Record<string, unknown>) {
    if (!enabled || !active) return

    const mapping = EVENT_MAP[String(event)]
    if (!mapping) return

    let rating: KlepaFeedbackRating | undefined
    if (mapping.feedback) {
      const rawRating = properties?.rating
      if (typeof rawRating !== "string" || !VALID_RATINGS.has(rawRating as KlepaFeedbackRating)) {
        return
      }
      rating = rawRating as KlepaFeedbackRating
    }

    const occurredAt = new Date().toISOString()
    const reference = buildReference(mapping.name, occurredAt, properties)
    const props = sanitizeProps(properties, meta, mapping)

    const queued: QueuedTelemetryEvent = {
      event: mapping.name,
      reference,
      occurredAt,
      ...(rating !== undefined ? { rating } : {}),
      ...(props !== undefined ? { props } : {}),
    }

    if (queue.length >= MAX_QUEUE) {
      queue.shift()
    }
    queue.push(queued)

    if (queue.length >= FLUSH_THRESHOLD) {
      flushInBackground(0)
    }
  }

  function buildPayload(events: QueuedTelemetryEvent[], installationId: string, appVersion?: string): string {
    const payload: TelemetryBatchPayload = {
      client: meta.client,
      installationId,
      ...(appVersion ? { appVersion } : {}),
      events,
    }
    return JSON.stringify(payload)
  }

  function takeNextBatch(installationId: string, appVersion?: string): { batch: QueuedTelemetryEvent[]; body: string } | null {
    if (queue.length === 0) return null

    const maxCount = Math.min(queue.length, MAX_BATCH_EVENTS)
    const batch: QueuedTelemetryEvent[] = []
    let body = ""

    for (let i = 0; i < maxCount; i++) {
      const item = queue[i]!
      const candidateBatch = [...batch, item]
      const candidateBody = buildPayload(candidateBatch, installationId, appVersion)
      if (Buffer.byteLength(candidateBody, "utf8") <= MAX_BODY_BYTES) {
        batch.push(item)
        body = candidateBody
        continue
      }

      if (i === 0) {
        // Guard against an unexpectedly large single event exceeding 32 KB: drop it cleanly.
        const dropped: QueuedTelemetryEvent = {
          event: item.event,
          reference: item.reference,
          occurredAt: item.occurredAt,
          ...(item.rating ? { rating: item.rating } : {}),
        }
        const fallbackBody = buildPayload([dropped], installationId, appVersion)
        queue.shift()
        if (Buffer.byteLength(fallbackBody, "utf8") <= MAX_BODY_BYTES) {
          return { batch: [dropped], body: fallbackBody }
        }
        return null
      }
      break
    }

    if (batch.length === 0) return null
    queue.splice(0, batch.length)
    return { batch, body }
  }

  async function drain(timeoutMs: number): Promise<void> {
    if (queue.length === 0) return

    const endpoint = getEndpoint()
    const installationId = Identity.getInstallationId()
    const appVersion = sanitizeAppVersion(meta.appVersion)
    const trafficSource = `${meta.client === "vscode" ? "Klepa-VSCode" : "Klepa-CLI"} v-${appVersion ?? "0.0.0"}`
    const deadline = Date.now() + Math.max(1, timeoutMs)

    while (queue.length > 0) {
      const remaining = deadline - Date.now()
      if (remaining <= 0) break

      const chunk = takeNextBatch(installationId, appVersion)
      if (!chunk) break

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Traffic-Source": trafficSource,
      }
      const token = Identity.getAuthToken()
      if (token) headers["Authorization"] = `Bearer ${token}`

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers,
          body: chunk.body,
          signal: AbortSignal.timeout(remaining),
        })
        if (!response.ok) {
          if (process.env.KILO_PRINT_LOGS) {
            console.warn("telemetry upload rejected", response.status)
          }
          break
        }
      } catch (err) {
        if (process.env.KILO_PRINT_LOGS) {
          console.warn("telemetry upload failed", err)
        }
        break
      }
    }
  }

  export async function flush(timeoutMs = 5000): Promise<void> {
    if (flushing) {
      await flushing
    }
    if (queue.length === 0) return
    const run = drain(timeoutMs)
    flushing = run
    try {
      await run
    } finally {
      if (flushing === run) flushing = null
    }
  }

  export function flushInBackground(delayMs = 300): void {
    if (!enabled || !active || bgTimer || queue.length === 0) return
    bgTimer = setTimeout(() => {
      bgTimer = null
      void flush()
    }, delayMs)
    bgTimer.unref?.()
  }

  export async function shutdown(timeoutMs = 2000): Promise<void> {
    clearTimers()
    const deadline = Date.now() + Math.max(1, timeoutMs)
    try {
      if (flushing) {
        const remaining = deadline - Date.now()
        if (remaining > 0) {
          await Promise.race([
            flushing,
            new Promise<void>((resolve) => {
              const timer = setTimeout(resolve, remaining)
              timer.unref?.()
            }),
          ])
        }
      }
      const remaining = deadline - Date.now()
      if (queue.length > 0 && remaining > 0) {
        await drain(remaining)
      }
    } finally {
      queue.length = 0
      active = false
    }
  }
}
