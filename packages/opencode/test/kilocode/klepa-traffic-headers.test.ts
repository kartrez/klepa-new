import { describe, expect, test } from "bun:test"
import { isKlepaProvider, klepaTrafficHeaders, KLEPA_TRAFFIC_SOURCE } from "../../src/kilocode/provider/gpt-chat-by"

describe("klepa traffic headers", () => {
  test("formats X-Traffic-Source with version", () => {
    expect(KLEPA_TRAFFIC_SOURCE).toMatch(/^Klepa-AI v/)
    expect(klepaTrafficHeaders()).toEqual({ "X-Traffic-Source": KLEPA_TRAFFIC_SOURCE })
  })

  test("recognizes klepa provider ids", () => {
    expect(isKlepaProvider("klepa")).toBe(true)
    expect(isKlepaProvider("gpt-chat-by")).toBe(true)
    expect(isKlepaProvider("openai")).toBe(false)
  })
})
