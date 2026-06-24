// KiloClaw lightweight language context
//
// Self-contained i18n for the KiloClaw panel. Does not depend on
// VSCodeProvider/ServerProvider — locale comes from the extension host
// via the claw context, falling back to navigator.language then "ru".

import { createContext, createEffect, createMemo, useContext, type JSX } from "solid-js"
import {
  DEFAULT_LOCALE,
  normalizeLocale,
  RTL_LOCALES,
  localeToBcp47,
  resolveTemplate,
} from "../../src/context/language-utils"
import type { Locale } from "../../src/context/language-utils"
import { dict as en } from "../i18n/en"
import { dict as ru } from "../i18n/ru"

const dicts: Record<Locale, Record<string, string>> = {
  en,
  ru: { ...en, ...ru },
}

type LanguageCtx = {
  t: (key: string, params?: Record<string, string | number | boolean | undefined>) => string
}

const LanguageContext = createContext<LanguageCtx>()

export function KiloClawLanguageProvider(props: { locale: () => string | undefined; children: JSX.Element }) {
  const resolved = createMemo<Locale>(() => {
    const ext = props.locale()
    if (ext) return normalizeLocale(ext)
    if (typeof navigator !== "undefined" && navigator.language) return normalizeLocale(navigator.language)
    return DEFAULT_LOCALE
  })

  const dict = createMemo(() => dicts[resolved()] ?? dicts[DEFAULT_LOCALE])

  createEffect(() => {
    const loc = resolved()
    document.documentElement.lang = localeToBcp47(loc)
    document.documentElement.dir = RTL_LOCALES.has(loc) ? "rtl" : "ltr"
  })

  const t = (key: string, params?: Record<string, string | number | boolean | undefined>) => {
    const text = dict()[key] ?? key
    return resolveTemplate(text, params)
  }

  return <LanguageContext.Provider value={{ t }}>{props.children}</LanguageContext.Provider>
}

export function useKiloClawLanguage(): LanguageCtx {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error("useKiloClawLanguage must be used within KiloClawLanguageProvider")
  return ctx
}
