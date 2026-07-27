// kilocode_change - new file
import { describe, expect, test } from "bun:test"
import {
  parseImageResponse,
  ensureExtension,
  buildMultipartBody,
  IMAGE_MODELS,
  DEFAULT_MODEL,
  resolveImageModel,
} from "../../../src/kilocode/tool/generate-image"

describe("generate-image response parser", () => {
  test("extracts PNG from data URL in image field", () => {
    const base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB"
    const body = JSON.stringify({ image: `data:image/png;base64,${base64}` })
    const result = parseImageResponse(body)
    expect(result).not.toBeNull()
    expect(result!.format).toBe("png")
    expect(result!.base64).toBe(base64)
  })

  test("extracts JPEG format", () => {
    const base64 = "/9j/4AAQSkZJRgABAQAAAQABAAD"
    const body = JSON.stringify({ image: `data:image/jpeg;base64,${base64}` })
    const result = parseImageResponse(body)
    expect(result!.format).toBe("jpeg")
    expect(result!.base64).toBe(base64)
  })

  test("returns null when image field is missing", () => {
    expect(parseImageResponse(JSON.stringify({}))).toBeNull()
  })

  test("returns null when image is not a string", () => {
    expect(parseImageResponse(JSON.stringify({ image: 123 }))).toBeNull()
  })

  test("returns null on malformed JSON", () => {
    expect(parseImageResponse("not json")).toBeNull()
  })

  test("returns null when data URL prefix is invalid", () => {
    expect(parseImageResponse(JSON.stringify({ image: "https://example.com/image.png" }))).toBeNull()
  })
})

describe("generate-image response parser MIME normalization", () => {
  test("normalizes jpg data URL to jpeg format", () => {
    const base64 = "/9j/4AAQSkZJRgABAQAAAQABAAD"
    const body = JSON.stringify({ image: `data:image/jpg;base64,${base64}` })
    const result = parseImageResponse(body)
    expect(result!.format).toBe("jpeg")
    expect(result!.base64).toBe(base64)
  })
})

describe("generate-image path extension", () => {
  test("appends .png when no extension", () => {
    expect(ensureExtension("output/logo", "png")).toBe("output/logo.png")
  })

  test("appends .jpg for jpeg format", () => {
    expect(ensureExtension("output/photo", "jpeg")).toBe("output/photo.jpg")
  })

  test("keeps existing .png extension when format is png", () => {
    expect(ensureExtension("output/logo.png", "png")).toBe("output/logo.png")
  })

  test("keeps existing .jpg extension when format is jpeg", () => {
    expect(ensureExtension("output/photo.jpg", "jpeg")).toBe("output/photo.jpg")
  })

  test("keeps existing .jpeg extension when format is jpeg", () => {
    expect(ensureExtension("output/photo.jpeg", "jpeg")).toBe("output/photo.jpeg")
  })

  test("replaces mismatched image extension when format differs", () => {
    expect(ensureExtension("output/photo.jpg", "png")).toBe("output/photo.png")
    expect(ensureExtension("output/photo.jpeg", "png")).toBe("output/photo.png")
    expect(ensureExtension("output/logo.png", "jpeg")).toBe("output/logo.jpg")
  })

  test("keeps uppercase .PNG extension when format is png", () => {
    expect(ensureExtension("output/logo.PNG", "png")).toBe("output/logo.PNG")
  })

  test("appends when path has a dot that is not an image extension", () => {
    expect(ensureExtension("assets/logo.final", "png")).toBe("assets/logo.final.png")
  })
})

describe("generate-image model catalog", () => {
  test("has a non-empty model list", () => {
    expect(IMAGE_MODELS.length).toBeGreaterThan(0)
  })

  test("includes the default model", () => {
    expect(IMAGE_MODELS.some((m) => m.value === DEFAULT_MODEL)).toBe(true)
  })

  test("every model has value and label", () => {
    for (const m of IMAGE_MODELS) {
      expect(typeof m.value).toBe("string")
      expect(m.value.length).toBeGreaterThan(0)
      expect(typeof m.label).toBe("string")
      expect(m.label.length).toBeGreaterThan(0)
    }
  })
})

describe("generate-image resolveImageModel", () => {
  test("prefers configured settings model over tool arg", () => {
    expect(resolveImageModel("black-forest-labs/flux.2-flex", DEFAULT_MODEL)).toBe(
      "black-forest-labs/flux.2-flex",
    )
  })

  test("falls back to tool arg when settings model is unset", () => {
    expect(resolveImageModel(undefined, "openai/gpt-5.4-image-2")).toBe("openai/gpt-5.4-image-2")
  })

  test("falls back to default when both are unset", () => {
    expect(resolveImageModel()).toBe(DEFAULT_MODEL)
  })
})

describe("generate-image multipart body", () => {
  test("builds valid multipart body with prompt, model and image", () => {
    const imageBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    const body = buildMultipartBody("testBoundary", "Make it sunset", "google/gemini-2.5-flash-image", imageBuf, "photo.png")

    const text = body.toString("utf-8")
    expect(text).toContain("--testBoundary")
    expect(text).toContain('name="prompt"')
    expect(text).toContain("Make it sunset")
    expect(text).toContain('name="model"')
    expect(text).toContain("google/gemini-2.5-flash-image")
    expect(text).toContain('name="images[]"')
    expect(text).toContain('filename="photo.png"')
    expect(text).toContain("Content-Type: image/png")
    expect(text).toContain("--testBoundary--")
  })

  test("detects JPEG from filename extension", () => {
    const body = buildMultipartBody("b", "test", "m", Buffer.from([0xff]), "photo.jpg")

    const text = body.toString("utf-8")
    expect(text).toContain("Content-Type: image/jpeg")
  })

  test("detects JPEG from .jpeg extension", () => {
    const body = buildMultipartBody("b", "test", "m", Buffer.from([0xff]), "photo.jpeg")

    const text = body.toString("utf-8")
    expect(text).toContain("Content-Type: image/jpeg")
  })

  test("defaults to JPEG for unknown extensions", () => {
    const body = buildMultipartBody("b", "test", "m", Buffer.from([0xff]), "photo.gif")

    const text = body.toString("utf-8")
    expect(text).toContain("Content-Type: image/jpeg")
  })
})
