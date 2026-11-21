import { mkdtempSync, existsSync, statSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { Identity } from "../identity.js"

let dir: string
const originalMachineId = process.env.KILO_MACHINE_ID

beforeEach(() => {
  delete process.env.KILO_MACHINE_ID
  dir = mkdtempSync(path.join(tmpdir(), "kilo-telemetry-identity-"))
  Identity.reset()
  Identity.setDataPath(dir)
})

afterEach(() => {
  if (originalMachineId === undefined) delete process.env.KILO_MACHINE_ID
  else process.env.KILO_MACHINE_ID = originalMachineId
  Identity.reset()
  Identity.setDataPath("")
  rmSync(dir, { recursive: true, force: true })
})

describe("Identity (in-memory Klepa auth + local installation ID)", () => {
  test("persists machineId to telemetry-id and never creates telemetry-profile.json", async () => {
    const first = await Identity.getMachineId()
    expect(first).toBeTruthy()
    expect(existsSync(path.join(dir, "telemetry-id"))).toBe(true)
    expect(existsSync(path.join(dir, "telemetry-profile.json"))).toBe(false)

    Identity.reset()
    const second = await Identity.getMachineId()
    expect(second).toBe(first)
    expect(Identity.getDistinctId()).toBe(first!)
  })

  test("honors KILO_MACHINE_ID override", async () => {
    process.env.KILO_MACHINE_ID = "custom-vscode-machine-id-1234"
    expect(await Identity.getMachineId()).toBe("custom-vscode-machine-id-1234")
    expect(Identity.getInstallationId()).toBe("custom-vscode-machine-id-1234")
  })

  test("falls back to a valid UUID when machineId is absent or invalid for installationId", async () => {
    const fallback = Identity.getInstallationId()
    expect(fallback).toMatch(/^[a-zA-Z0-9._-]{8,64}$/)

    process.env.KILO_MACHINE_ID = "tiny"
    await Identity.getMachineId()
    const second = Identity.getInstallationId()
    expect(second).toMatch(/^[a-zA-Z0-9._-]{8,64}$/)
    expect(second).not.toBe("tiny")
  })

  test("stores auth token in memory only and updates via updateFromKiloAuth without network or disk writes", async () => {
    await Identity.updateFromKiloAuth("  sk-klepa-token  ", "org-1")
    expect(Identity.getAuthToken()).toBe("sk-klepa-token")
    expect(Identity.getOrganizationId()).toBe("org-1")
    expect(Identity.getUserId()).toBeNull()
    expect(existsSync(path.join(dir, "telemetry-profile.json"))).toBe(false)

    Identity.setAuthToken("   ")
    expect(Identity.getAuthToken()).toBeNull()

    await Identity.updateFromKiloAuth("sk-next")
    expect(Identity.getAuthToken()).toBe("sk-next")
    expect(Identity.getOrganizationId()).toBeNull()

    await Identity.updateFromKiloAuth(null)
    expect(Identity.getAuthToken()).toBeNull()
    expect(statSync(dir).isDirectory()).toBe(true)
  })
})
