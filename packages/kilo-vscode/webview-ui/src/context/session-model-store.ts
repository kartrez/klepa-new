import type { ModelSelection, Provider } from "../types/messages"
import { resolveModelSelection } from "./model-selection"
import { GPT_CHAT_BY_PROVIDER_ID, normalizeKlepaModelId } from "../../../src/shared/gpt-chat-by"

/**
 * Pure-logic helpers for per-session and global model selection.
 *
 * The SessionProvider delegates to these so the core state transitions
 * can be tested without SolidJS reactivity.
 */

export interface ModelStore {
  /** agentName -> model (global, extension-lifetime) */
  modelSelections: Record<string, ModelSelection | null>
  /** sessionID -> per-session model override */
  sessionOverrides: Record<string, ModelSelection>
  /** sessionID -> agent name */
  agentSelections: Record<string, string>
  recentModels: ModelSelection[]
}

export interface ResolveEnv {
  providers: Record<string, Provider>
  connected: string[]
  fallback: ModelSelection | null
  getModeModel: (agentName: string) => ModelSelection | null
  getGlobalModel: () => ModelSelection | null
}

function resolveModel(
  env: ResolveEnv,
  agentName: string,
  override?: ModelSelection | null,
  recents?: ModelSelection[],
): ModelSelection | null {
  return resolveModelSelection({
    providers: env.providers,
    connected: env.connected,
    override,
    mode: env.getModeModel(agentName),
    global: env.getGlobalModel(),
    recent: recents,
    fallback: env.fallback,
  })
}

/**
 * Returns the model for a specific session, honoring per-session overrides.
 *
 * Precedence: sessionOverride > global modelSelections[agent] > config/default.
 */
export function getSessionModel(
  store: ModelStore,
  env: ResolveEnv,
  sessionID: string,
  defaultAgent: string,
): ModelSelection | null {
  const override = store.sessionOverrides[sessionID]
  if (override) return override
  const agentName = store.agentSelections[sessionID] ?? defaultAgent
  return resolveModel(env, agentName, store.modelSelections[agentName], store.recentModels)
}

/**
 * Returns the model for the "current" view (model picker display).
 *
 * Precedence: sessionOverride[sid] > global modelSelections[agent] > config/default.
 */
export function getSelected(
  store: ModelStore,
  env: ResolveEnv,
  sessionID: string | undefined,
  agentName: string,
): ModelSelection | null {
  if (sessionID) {
    const session = store.sessionOverrides[sessionID]
    if (session) return session
  }
  return resolveModel(env, agentName, store.modelSelections[agentName], store.recentModels)
}

export interface ApplyResult {
  modelSelections: Record<string, ModelSelection | null>
  sessionOverrides: Record<string, ModelSelection>
}

/**
 * Apply a user-initiated model selection.
 *
 * Session-scoped selections write only to the per-session override.
 * No-session selections write to the global modelSelections map so sidebar
 * default picks still mirror CLI TUI's model.json behavior.
 */
export function applyModel(
  store: ModelStore,
  agentName: string,
  selection: ModelSelection,
  sessionID: string | undefined,
): ApplyResult {
  const modelSelections = sessionID
    ? { ...store.modelSelections }
    : { ...store.modelSelections, [agentName]: selection }
  const sessionOverrides = { ...store.sessionOverrides }

  if (sessionID) {
    sessionOverrides[sessionID] = selection
  }

  return { modelSelections, sessionOverrides }
}

export function pruneInvalidModelSelections(
  store: ModelStore,
  providers: Record<string, Provider>,
  connected: string[],
  fallback: ModelSelection,
): {
  modelSelections: Record<string, ModelSelection | null>
  sessionOverrides: Record<string, ModelSelection>
  resetAgents: string[]
} {
  const modelKey = (selection: ModelSelection) =>
    selection.providerID === GPT_CHAT_BY_PROVIDER_ID
      ? normalizeKlepaModelId(selection.modelID)
      : selection.modelID

  const valid = (selection: ModelSelection | null) => {
    if (!selection) return true
    const provider = providers[selection.providerID]
    if (!provider) return false
    if (
      selection.providerID !== "kilo" &&
      selection.providerID !== GPT_CHAT_BY_PROVIDER_ID &&
      !connected.includes(selection.providerID)
    ) {
      return false
    }
    return !!provider.models[modelKey(selection)]
  }

  const modelSelections = { ...store.modelSelections }
  const sessionOverrides = { ...store.sessionOverrides }
  const resetAgents: string[] = []

  for (const [agent, selection] of Object.entries(modelSelections)) {
    if (!selection) continue
    const modelID = modelKey(selection)
    if (modelID !== selection.modelID) {
      modelSelections[agent] = { ...selection, modelID }
    }
  }

  for (const [sessionID, selection] of Object.entries(sessionOverrides)) {
    const modelID = modelKey(selection)
    if (modelID !== selection.modelID) {
      sessionOverrides[sessionID] = { ...selection, modelID }
    }
  }

  for (const [agent, selection] of Object.entries(modelSelections)) {
    if (!selection || valid(selection)) continue
    modelSelections[agent] = fallback
    resetAgents.push(agent)
  }

  for (const [sessionID, selection] of Object.entries(sessionOverrides)) {
    if (valid(selection)) continue
    delete sessionOverrides[sessionID]
  }

  return { modelSelections, sessionOverrides, resetAgents }
}
