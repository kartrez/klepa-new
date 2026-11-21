import { createEffect, createSignal, onCleanup, onMount } from "solid-js"
import type { Accessor } from "solid-js"
import type { ExtensionMessage, WebviewMessage } from "../types/messages"

const DEBOUNCE_MS = 500
const MIN_LENGTH = 3

interface VSCodeContext {
  postMessage: (message: WebviewMessage) => void
  onMessage: (handler: (message: ExtensionMessage) => void) => () => void
}

export interface GhostText {
  text: Accessor<string>
  enabled: Accessor<boolean>
  /** Idempotent sync — call from any handler to reconcile ghost text visibility. */
  sync: (textarea: HTMLTextAreaElement | undefined) => void
  /** Schedule a completion request after debounce. Call on every input. */
  scheduleRequest: (val: string, textarea: HTMLTextAreaElement | undefined) => void
  /** Accept the full ghost text suggestion. */
  accept: () => { text: string } | null
  /** Dismiss the current ghost text. */
  dismiss: () => void
  /** Whether the mention dropdown is open (suppresses ghost text). */
  setMentionOpen: (open: boolean) => void
}

/**
 * Centralized ghost text (AI autocomplete) hook.
 *
 * Single source of truth for ghost text visibility — call `sync()` from every
 * relevant handler (onInput, onFocus, onBlur, onSelect, onKeyDown, message
 * listener) instead of scattering show/hide logic.
 *
 * Follows the legacy "syncAutocompleteTextVisibility" pattern.
 */
export function useGhostText(_vscode: VSCodeContext, _getText: () => string, _connected: () => boolean): GhostText {
  const empty = () => ""
  const disabled = () => false
  return {
    text: empty,
    enabled: disabled,
    sync: () => {},
    scheduleRequest: () => {},
    accept: () => null,
    dismiss: () => {},
    setMentionOpen: () => {},
  }
}
