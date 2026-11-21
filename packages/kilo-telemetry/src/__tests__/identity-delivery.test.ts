import { afterEach, beforeEach, expect, test } from "bun:test"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "klepa-delivery-"))
  await Bun.write(path.join(dir, "telemetry-id"), "test-machine")
})
afterEach(() => rm(dir, { recursive: true, force: true }))

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

async function run(env: Record<string, string> = {}) {
  const child = Bun.spawn([process.execPath, path.join(import.meta.dir, "fixtures/identity-process.ts")], {
    env: {
      ...process.env,
      KLEPA_TELEMETRY_URL: "https://telemetry.example.test/api/klepa/telemetry",
      KILO_TELEMETRY_LEVEL: "all",
      KILO_TELEMETRY_HOST_DISABLED: "0",
      KILO_APP_NAME: "klepa-cli",
      KILO_APP_VERSION: "",
      KILO_PLATFORM: "cli",
      KILO_MACHINE_ID: "",
      DO_NOT_TRACK: "",
      KLEPA_ANALYTICS: "",
      TEST_DATA: dir,
      ...env,
    },
    stdout: "pipe",
    stderr: "pipe",
  })
  const output = await new Response(child.stdout).text()
  const error = await new Response(child.stderr).text()
  expect(await child.exited, error).toBe(0)
  const result = JSON.parse(output) as CapturedRequest[]
  for (const req of result) {
    for (const ev of req.body.events) {
      expect(ev.event).not.toBe("$identify")
      expect(ev.event).not.toBe("$create_alias")
      expect(ev.props).not.toHaveProperty("$set")
    }
  }
  return result
}

test("sends Option 1 batch payload with Bearer token, X-Traffic-Source, and installationId without PostHog files", async () => {
  const reqs = await run({ TEST_VERSION: "2.0.0", TEST_ORG: "org-new" })
  expect(reqs).toHaveLength(1)
  expect(reqs[0]).toMatchObject({
    url: "https://telemetry.example.test/api/klepa/telemetry",
    headers: {
      authorization: "Bearer test-token",
      "x-traffic-source": "Klepa-CLI v-2.0.0",
    },
    body: {
      client: "cli",
      installationId: "test-machine",
      appVersion: "2.0.0",
    },
  })
  expect(reqs[0]!.body.events.map((e) => e.event)).toEqual(["app_open"])
  const files = await readdir(dir)
  expect(files.filter((f) => f.startsWith("telemetry-alias-") || f === "telemetry-profile.json")).toEqual([])
})

test("failed uploads exit cleanly without leaving alias or profile artifacts", async () => {
  const failed = await run({ TEST_FAIL: "1" })
  expect(failed).toHaveLength(1)
  const files = await readdir(dir)
  expect(files.filter((f) => f.startsWith("telemetry-alias-") || f === "telemetry-profile.json")).toEqual([])
})

test("disabled telemetry sends no requests", async () => {
  expect(await run({ KILO_TELEMETRY_LEVEL: "off" })).toEqual([])
  expect(await run({ DO_NOT_TRACK: "1" })).toEqual([])
  expect(await run({ DO_NOT_TRACK: "true" })).toEqual([])
  expect(await run({ KLEPA_ANALYTICS: "0" })).toEqual([])
  expect(await run({ KLEPA_ANALYTICS: "false" })).toEqual([])
  expect(await run()).not.toEqual([])
})

test.each(["OFF", "0", "false", "unexpected"])("disables telemetry with KILO_TELEMETRY_LEVEL=%j", async (level) => {
  expect(await run({ KILO_TELEMETRY_LEVEL: level })).toEqual([])
})

test("allows telemetry with KILO_TELEMETRY_LEVEL=ON", async () => {
  expect(await run({ KILO_TELEMETRY_LEVEL: "ON" })).not.toEqual([])
})

test("a config opt-out wins over a client that sets KILO_TELEMETRY_LEVEL=all", async () => {
  expect(await run({ KILO_TELEMETRY_LEVEL: "all", TEST_CONFIG_ENABLED: "0" })).toEqual([])
})

test("a blank telemetry environment defers to the configured preference", async () => {
  expect(await run({ KILO_TELEMETRY_LEVEL: "  ", TEST_CONFIG_ENABLED: "0" })).toEqual([])
  expect(await run({ KILO_TELEMETRY_LEVEL: "" })).not.toEqual([])
})

test("runtime updates cannot turn on telemetry against an environment or host opt-out", async () => {
  expect(await run({ KILO_TELEMETRY_LEVEL: "off", TEST_HOST_ENABLED: "1", TEST_RUNTIME_ENABLED: "1" })).toEqual([])
  expect(await run({ KILO_TELEMETRY_HOST_DISABLED: "1", TEST_RUNTIME_ENABLED: "1" })).toEqual([])
  expect(await run({ DO_NOT_TRACK: "1", TEST_HOST_ENABLED: "1", TEST_RUNTIME_ENABLED: "1" })).toEqual([])
  expect(await run({ KLEPA_ANALYTICS: "0", TEST_HOST_ENABLED: "1", TEST_RUNTIME_ENABLED: "1" })).toEqual([])
})

test("lifting the host opt-out only resumes telemetry if config allows it", async () => {
  expect(await run({ KILO_TELEMETRY_HOST_DISABLED: "1", TEST_HOST_ENABLED: "1", TEST_CONFIG_ENABLED: "0" })).toEqual([])
  expect(await run({ KILO_TELEMETRY_HOST_DISABLED: "1", TEST_HOST_ENABLED: "1" })).not.toEqual([])
})

test("login flow captures app_open, auth_success, and cli_exit in order", async () => {
  const reqs = await run({ TEST_LOGIN: "1", TEST_ORG: "org-login" })
  expect(reqs).toHaveLength(1)
  expect(reqs[0]!.headers.authorization).toBe("Bearer test-token")
  expect(reqs[0]!.body.events.map((e) => e.event)).toEqual(["app_open", "auth_success", "cli_exit"])
})
