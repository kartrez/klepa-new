import { dict as en } from "./en"
import { dict as ru } from "./ru"
import { type dict as enDict } from "./en"

const bundles: Record<string, Record<string, string>> = {
  en,
  ru,
}

function resolveLocale(lang: string): string {
  const lower = lang.toLowerCase()
  if (lower.startsWith("en")) return "en"
  if (lower.startsWith("ru")) return "ru"
  return "ru"
}

function loadTranslations(): Record<string, string> {
  const vscode = require("vscode") as typeof import("vscode")
  const locale = resolveLocale(vscode.env.language)
  return { ...en, ...(bundles[locale] ?? ru) }
}

const translations: Record<string, string> = loadTranslations()

export function t(key: keyof typeof enDict, vars?: Record<string, string | number>): string {
  let text = translations[key] ?? key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{{${k}}}`, String(v))
    }
  }
  return text
}
