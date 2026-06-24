export type Locale = "en" | "ru"

export const DEFAULT_LOCALE: Locale = "ru"

/** Locales that use right-to-left script. */
export const RTL_LOCALES = new Set<Locale>()

/** Map internal locale IDs to valid BCP 47 language tags for the HTML lang attribute. */
export const LOCALE_BCP47: Partial<Record<Locale, string>> = {}

/** Return the BCP 47 language tag for a locale (falls back to the locale id itself). */
export function localeToBcp47(locale: Locale): string {
  return LOCALE_BCP47[locale] ?? locale
}

export const LOCALES: readonly Locale[] = ["en", "ru"]

/**
 * Normalize a BCP 47 language tag to a supported Locale.
 * Falls back to Russian for unrecognized locales.
 */
export function normalizeLocale(lang: string): Locale {
  const lower = lang.toLowerCase()
  if (lower.startsWith("en")) return "en"
  if (lower.startsWith("ru")) return "ru"
  return DEFAULT_LOCALE
}

/**
 * Perform {{key}} template interpolation against a params record.
 */
export function resolveTemplate(text: string, params?: Record<string, string | number | boolean | undefined>): string {
  if (!params) return text
  return text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, rawKey) => {
    const value = params[String(rawKey)]
    return value === undefined ? "" : String(value)
  })
}
