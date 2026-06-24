import { hasIndexingPlugin } from "@kilocode/kilo-indexing/detect"
import * as vscode from "vscode"

type PluginSpec = string | [string, Record<string, unknown>]

type ConfigLike = {
  plugin?: readonly PluginSpec[] | null
}

export type Features = {
  indexing: boolean
  sandboxControls: boolean
  autocomplete: boolean
}

export function configFeatures(config?: ConfigLike | null): Features {
  return {
    indexing: hasIndexingPlugin(config?.plugin ?? []),
    sandboxControls: vscode.workspace.getConfiguration("kilo-code.new.internal").get("sandboxControls", false),
    // Klepa chat API has no FIM endpoint; inline autocomplete needs Codestral/Mercury via Kilo Gateway.
    autocomplete: false,
  }
}
