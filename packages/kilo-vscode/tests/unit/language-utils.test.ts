import { describe, it, expect } from "bun:test"
import { DEFAULT_LOCALE, normalizeLocale, resolveTemplate } from "../../webview-ui/src/context/language-utils"

describe("normalizeLocale", () => {
  it("returns 'en' for English", () => {
    expect(normalizeLocale("en")).toBe("en")
    expect(normalizeLocale("en-US")).toBe("en")
    expect(normalizeLocale("en-GB")).toBe("en")
  })

  it("returns 'ru' for Russian", () => {
    expect(normalizeLocale("ru")).toBe("ru")
    expect(normalizeLocale("ru-RU")).toBe("ru")
  })

  it("falls back to Russian for unsupported locales", () => {
    expect(normalizeLocale("de")).toBe(DEFAULT_LOCALE)
    expect(normalizeLocale("zh-CN")).toBe(DEFAULT_LOCALE)
    expect(normalizeLocale("xx")).toBe(DEFAULT_LOCALE)
  })

  it("is case-insensitive", () => {
    expect(normalizeLocale("EN")).toBe("en")
    expect(normalizeLocale("RU")).toBe("ru")
  })
})

describe("resolveTemplate", () => {
  it("returns text unchanged when no params", () => {
    expect(resolveTemplate("hello world")).toBe("hello world")
  })

  it("returns text unchanged when params is undefined", () => {
    expect(resolveTemplate("no {{var}} here", undefined)).toBe("no {{var}} here")
  })

  it("interpolates a single variable", () => {
    expect(resolveTemplate("Hello {{name}}!", { name: "World" })).toBe("Hello World!")
  })

  it("interpolates multiple variables", () => {
    const result = resolveTemplate("{{a}} + {{b}} = {{c}}", { a: "1", b: "2", c: "3" })
    expect(result).toBe("1 + 2 = 3")
  })

  it("replaces missing variable with empty string", () => {
    expect(resolveTemplate("{{missing}}", {})).toBe("")
  })

  it("handles numeric variable values", () => {
    expect(resolveTemplate("count: {{n}}", { n: 42 })).toBe("count: 42")
  })

  it("handles whitespace around key in braces", () => {
    expect(resolveTemplate("{{ name }}", { name: "test" })).toBe("test")
  })

  it("leaves unrelated text intact", () => {
    const result = resolveTemplate("prefix {{x}} suffix", { x: "VALUE" })
    expect(result).toBe("prefix VALUE suffix")
  })
})
