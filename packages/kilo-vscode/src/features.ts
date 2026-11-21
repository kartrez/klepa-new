import type { KiloClient } from "@kilocode/sdk/v2"
import * as vscode from "vscode"

type PluginSpec = string | [string, Record<string, unknown>]

type ConfigLike = {
  plugin?: readonly PluginSpec[] | null
}

export type Features = {
  indexing: boolean
  sandboxControls: boolean
  autocomplete: boolean
  backgroundSubagents: boolean
  speechToText: boolean
  marketplace: boolean
  remoteControl: boolean
  integratedBrowser: boolean
  projectMemory: boolean
  swarm: boolean
  codeMode: boolean
  caffeination: boolean
  nativeNotebookTools: boolean
}

export function configFeatures(
  _config?: ConfigLike | null,
  _backgroundSubagents = false,
  _remote = !!vscode.env.remoteName,
): Features {
  // Klepa AI VS Code keeps only core chat/agent features enabled.
  return {
    indexing: false,
    sandboxControls: false,
    autocomplete: false,
    backgroundSubagents: false,
    speechToText: false,
    marketplace: true,
    remoteControl: false,
    integratedBrowser: false,
    projectMemory: false,
    swarm: false,
    codeMode: false,
    caffeination: false,
    nativeNotebookTools: false,
  }
}

export async function serverFeatures(client: Pick<KiloClient, "experimental">, dir: string) {
  if (!client.experimental?.capabilities?.get) return false
  try {
    const { data } = await client.experimental.capabilities.get({ directory: dir }, { throwOnError: true })
    return data?.backgroundSubagents === true
  } catch (error) {
    console.warn("[Kilo New] Failed to fetch server capabilities:", error)
    return false
  }
}
