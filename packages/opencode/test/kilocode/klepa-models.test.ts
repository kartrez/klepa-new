import { describe, expect, test } from "bun:test"
import { klepaModelId, klepaModelsFromResponse, toKlepaCatalogModel } from "../../src/kilocode/provider/klepa-models"

describe("klepa models", () => {
  test("klepaModelId keeps full API ids", () => {
    expect(klepaModelId("klepa/auto")).toBe("klepa/auto")
    expect(klepaModelId("klepa/free")).toBe("klepa/free")
    expect(klepaModelId("google/gemini-3.1-pro")).toBe("google/gemini-3.1-pro")
    expect(klepaModelId("auto")).toBe("klepa/auto")
    expect(klepaModelId("free")).toBe("klepa/free")
  })

  test("toKlepaCatalogModel maps full API payload", () => {
    const model = toKlepaCatalogModel({
      name: "klepa/auto",
      maxTokens: 64000,
      contextWindow: 200000,
      supportsImages: true,
      supportsPromptCache: true,
      supportsNativeTools: true,
      supportsReasoningEffort: false,
      inputPrice: 1,
      outputPrice: 3,
      displayName: "klepa/auto",
      description: "openrouter/auto",
      isFree: false,
      recommended: true,
      architecture: {
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
      },
      supportedParameters: ["tools", "temperature"],
    })
    expect(model.id).toBe("klepa/auto")
    expect(model.name).toBe("klepa/auto")
    expect(model.family).toBe("openrouter/auto")
    expect(model.limit.context).toBe(200000)
    expect(model.limit.output).toBe(64000)
    expect(model.recommendedIndex).toBe(0)
    expect(model.tool_call).toBe(true)
    expect(model.reasoning).toBe(false)
    expect(model.temperature).toBe(true)
    expect(model.modalities).toEqual({ input: ["text", "image"], output: ["text"] })
  })

  test("toKlepaCatalogModel derives flags from supportedParameters", () => {
    const model = toKlepaCatalogModel({
      name: "google/gemini-3.1-pro",
      contextWindow: 1000000,
      supportsReasoningEffort: true,
      architecture: { inputModalities: ["text", "image"], outputModalities: ["text"] },
      supportedParameters: ["tools", "reasoning", "temperature"],
    })
    expect(model.reasoning).toBe(true)
    expect(model.temperature).toBe(true)
    expect(model.tool_call).toBe(true)
  })

  test("klepaModelsFromResponse indexes by API model id", () => {
    const models = klepaModelsFromResponse([
      { name: "klepa/auto", recommended: true },
      { name: "klepa/free" },
      { name: "google/gemini-3.1-pro" },
    ])
    expect(Object.keys(models)).toEqual(["klepa/auto", "klepa/free", "google/gemini-3.1-pro"])
  })
})
