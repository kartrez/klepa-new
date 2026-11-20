import type { ModelSelection, Provider } from "../types/messages"
import { resolveModelSelection } from "./model-selection"
import { GPT_CHAT_BY_PROVIDER_ID, normalizeKlepaModelId } from "../../../src/shared/gpt-chat-by"

/**
 * Pure-logic helpers for per-session and per-agent model selection.
 *
 * The SessionProvider delegates to these so the core state transitions
 * can be tested without SolidJS reactivity.
 */

/** Scope key for the no-session composer. Cannot collide with `ses_*` IDs, UUID drafts, or `pending:` tabs. */
export const COMPOSER = "composer"

export interface ModelStore {
  /** scope -> agent -> explicit model pick */
  sessionOverrides: Record<string, Record<string, ModelSelection>>
  /** sessionID -> agent name */
  agentSelections: Record<string, string>
  recentModels: ModelSelection[]
}

export interface ResolveEnv {
  providers: Record<string, Provider>
  connected: string[]
  ready?: boolean
  organizationId?: string | null
  defaults?: Record<string, string>
  fallback: ModelSelection | null
  getModeModel: (agentName: string) => ModelSelection | null
  getGlobalModel: () => ModelSelection | null
}

function resolveModel(
  env: ResolveEnv,
  agentName: string,
  session?: ModelSelection,
  recents?: ModelSelection[],
): ModelSelection | null {
  return resolveModelSelection({
    providers: env.providers,
    connected: env.connected,
    ready: env.ready,
    organizationId: env.organizationId,
    defaults: env.defaults,
    session,
    mode: env.getModeModel(agentName),
    global: env.getGlobalModel(),
    recent: recents,
    fallback: env.fallback,
  })
}

/** Pick(scope, agent): the model the user explicitly chose in that scope while on that agent. */
export function getPick(store: ModelStore, scope: string | undefined, agent: string): ModelSelection | undefined {
  return scope ? store.sessionOverrides[scope]?.[agent] : undefined
}

/**
 * Returns the model for a specific session, honoring its per-agent picks.
 *
 * Precedence: Pick(session, agent) > agent config > global config > org/recents > fallback.
 */
export function getSessionModel(
  store: ModelStore,
  env: ResolveEnv,
  sessionID: string,
  defaultAgent: string,
): ModelSelection | null {
  const agentName = store.agentSelections[sessionID] ?? defaultAgent
  return getSelected(store, env, sessionID, agentName)
}

/**
 * Returns the model for the "current" view (model picker display).
 *
 * Precedence: Pick(scope, agent) > agent config > global config > org/recents > fallback.
 */
export function getSelected(
  store: ModelStore,
  env: ResolveEnv,
  sessionID: string | undefined,
  agentName: string,
): ModelSelection | null {
  return resolveModel(env, agentName, getPick(store, sessionID, agentName), store.recentModels)
}

/** Returns the effective model for an agent outside any pick scope. */
export function getAgentModel(store: ModelStore, env: ResolveEnv, agentName: string): ModelSelection | null {
  return resolveModel(env, agentName, undefined, store.recentModels)
}

export interface ApplyResult {
  sessionOverrides: Record<string, Record<string, ModelSelection>>
}

/**
 * Apply a user-initiated model selection: write Pick(scope, agent).
 */
export function applyModel(
  store: ModelStore,
  agentName: string,
  selection: ModelSelection,
  sessionID: string,
): ApplyResult {
  const agents = { ...store.sessionOverrides[sessionID], [agentName]: selection }
  return { sessionOverrides: { ...store.sessionOverrides, [sessionID]: agents } }
}

export function pruneInvalidModelSelections(
  store: ModelStore,
  providers: Record<string, Provider>,
  connected: string[],
): {
  sessionOverrides: Record<string, Record<string, ModelSelection>>
  recentModels: ModelSelection[]
} {
  const modelKey = (selection: ModelSelection) =>
    selection.providerID === GPT_CHAT_BY_PROVIDER_ID
      ? normalizeKlepaModelId(selection.modelID)
      : selection.modelID

  const valid = (selection: ModelSelection) => {
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

  const sessionOverrides: Record<string, Record<string, ModelSelection>> = {}
  for (const [scope, agents] of Object.entries(store.sessionOverrides)) {
    const next: Record<string, ModelSelection> = {}
    for (const [agent, selection] of Object.entries(agents)) {
      const normalized = { ...selection, modelID: modelKey(selection) }
      if (valid(normalized)) next[agent] = normalized
    }
    if (Object.keys(next).length > 0) sessionOverrides[scope] = next
  }

  const recentModels: ModelSelection[] = []
  for (const selection of store.recentModels) {
    const normalized = { ...selection, modelID: modelKey(selection) }
    if (valid(normalized)) recentModels.push(normalized)
  }

  return { sessionOverrides, recentModels }
}
