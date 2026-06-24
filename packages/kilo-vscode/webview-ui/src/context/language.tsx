/**
 * Language context
 * Provides i18n translations for kilo-ui components.
 * Merges UI translations from @opencode-ai/ui and Kilo overrides from @kilocode/kilo-i18n.
 *
 * Locale priority: user override → VS Code display language → browser language → "ru"
 */

import { createSignal, createMemo, createEffect, ParentComponent, Accessor } from "solid-js"
import { I18nProvider } from "@kilocode/kilo-ui/context"
import type { UiI18nKey, UiI18nParams } from "@kilocode/kilo-ui/context"
import { dict as uiEn } from "@kilocode/kilo-ui/i18n/en"
import { dict as uiRu } from "@kilocode/kilo-ui/i18n/ru"
import { dict as appEn } from "../i18n/en"
import { dict as appRu } from "../i18n/ru"
import { dict as amEn } from "../../agent-manager/i18n/en"
import { dict as amRu } from "../../agent-manager/i18n/ru"
import { dict as kiloEn } from "@kilocode/kilo-i18n/en"
import { dict as kiloRu } from "@kilocode/kilo-i18n/ru"
import { useVSCode } from "./vscode"
import {
  DEFAULT_LOCALE,
  normalizeLocale as _normalizeLocale,
  resolveTemplate as _resolveTemplate,
} from "./language-utils"

export type { Locale } from "./language-utils"
export { LOCALES } from "./language-utils"
import type { Locale } from "./language-utils"
import { LOCALES, RTL_LOCALES, localeToBcp47 } from "./language-utils"

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  ru: "Русский",
}

const baseEn = { ...appEn, ...uiEn, ...kiloEn }
const dicts: Record<Locale, Record<string, string>> = {
  en: { ...baseEn, ...amEn },
  ru: { ...baseEn, ...appRu, ...uiRu, ...kiloRu, ...amRu },
}

function normalizeLocale(lang: string): Locale {
  return _normalizeLocale(lang)
}

function resolveTemplate(text: string, params?: UiI18nParams) {
  return _resolveTemplate(text, params as Record<string, string | number | boolean | undefined>)
}

interface LanguageProviderProps {
  vscodeLanguage?: Accessor<string | undefined>
  languageOverride?: Accessor<string | undefined>
}

export const LanguageProvider: ParentComponent<LanguageProviderProps> = (props) => {
  const vscode = useVSCode()
  const [userOverride, setUserOverride] = createSignal<Locale | "">("")

  createEffect(() => {
    const override = props.languageOverride?.()
    if (override) {
      setUserOverride(normalizeLocale(override))
    }
  })

  const locale = createMemo<Locale>(() => {
    const override = userOverride()
    if (override) {
      return override
    }
    const vscodeLang = props.vscodeLanguage?.()
    if (vscodeLang) {
      return normalizeLocale(vscodeLang)
    }
    if (typeof navigator !== "undefined" && navigator.language) {
      return normalizeLocale(navigator.language)
    }
    return DEFAULT_LOCALE
  })

  const dict = createMemo(() => dicts[locale()] ?? dicts[DEFAULT_LOCALE])

  createEffect(() => {
    const loc = locale()
    document.documentElement.lang = localeToBcp47(loc)
    document.documentElement.dir = RTL_LOCALES.has(loc) ? "rtl" : "ltr"
  })

  const t = (key: UiI18nKey, params?: UiI18nParams) => {
    const text = (dict() as Record<string, string>)[key] ?? String(key)
    return resolveTemplate(text, params)
  }

  const setLocale = (next: Locale | "") => {
    setUserOverride(next)
    vscode.postMessage({ type: "setLanguage", locale: next })
  }

  return (
    <LanguageContext.Provider
      value={{ locale, setLocale, userOverride, t: t as (key: string, params?: UiI18nParams) => string }}
    >
      <I18nProvider value={{ locale: () => locale(), t }}>{props.children}</I18nProvider>
    </LanguageContext.Provider>
  )
}

import { createContext, useContext } from "solid-js"

export interface LanguageContextValue {
  locale: Accessor<Locale>
  setLocale: (locale: Locale | "") => void
  userOverride: Accessor<Locale | "">
  t: (key: string, params?: UiI18nParams) => string
}

export const LanguageContext = createContext<LanguageContextValue>()

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) {
    throw new Error("useLanguage must be used within a LanguageProvider")
  }
  return ctx
}
