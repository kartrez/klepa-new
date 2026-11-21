import * as path from "node:path"

const INSTALLATION_ID_RE = /^[a-zA-Z0-9._-]{8,64}$/

export namespace Identity {
  let machineId: string | null = null
  let fallbackInstallationId: string | null = null
  let authToken: string | null = null
  let organizationId: string | null = null
  let dataPath = ""

  export function setDataPath(p: string) {
    dataPath = p
  }

  export async function getMachineId(): Promise<string | undefined> {
    if (machineId) return machineId
    const override = process.env.KILO_MACHINE_ID?.trim()
    if (override) {
      machineId = override
      return machineId
    }

    // Don't write to the working directory if no data path is configured
    if (!dataPath) return undefined

    const filepath = path.join(dataPath, "telemetry-id")
    const file = Bun.file(filepath)

    if (await file.exists()) {
      const existing = (await file.text()).trim()
      if (existing) {
        machineId = existing
        return machineId
      }
    }

    machineId = crypto.randomUUID()
    await Bun.write(filepath, machineId)
    return machineId
  }

  export function getInstallationId(): string {
    const raw = machineId?.trim() || process.env.KILO_MACHINE_ID?.trim() || ""
    const sanitized = raw.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 64)
    if (INSTALLATION_ID_RE.test(sanitized)) return sanitized
    fallbackInstallationId ??= crypto.randomUUID()
    return fallbackInstallationId
  }

  export function getDistinctId(): string {
    return machineId || "unknown"
  }

  export function getUserId(): string | null {
    return null
  }

  export function getOrganizationId(): string | null {
    return organizationId
  }

  export function setOrganizationId(orgId: string | null) {
    organizationId = orgId
  }

  export function setAuthToken(token: string | null) {
    const trimmed = typeof token === "string" ? token.trim() : ""
    authToken = trimmed.length > 0 ? trimmed : null
  }

  export function getAuthToken(): string | null {
    return authToken
  }

  export async function updateFromKiloAuth(token: string | null, accountId?: string): Promise<void> {
    organizationId = accountId || null
    setAuthToken(token)
  }

  export function reset() {
    machineId = null
    fallbackInstallationId = null
    authToken = null
    organizationId = null
  }
}
