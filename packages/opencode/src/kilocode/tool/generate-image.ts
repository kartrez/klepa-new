// kilocode_change - new file
import { Effect, Schema } from "effect"
import { HttpClient, HttpClientRequest } from "effect/unstable/http"
import * as path from "path"
import { readFile } from "fs/promises"
import * as Tool from "../../tool/tool"
import * as Auth from "../../auth"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { InstanceState } from "@/effect/instance-state"
import * as Log from "@opencode-ai/core/util/log"
import { assertExternalDirectoryEffect } from "../../tool/external-directory"
import { Config } from "@/config/config"
import { GPT_CHAT_BY_API_BASE, GPT_CHAT_BY_ENV_KEY } from "../provider/gpt-chat-by"
import DESCRIPTION from "./generate-image.txt"

const log = Log.create({ service: "tool.generate_image" })

const IMAGE_GEN_URL = `${GPT_CHAT_BY_API_BASE}chat/image`
const IMAGE_EDIT_URL = `${GPT_CHAT_BY_API_BASE}chat/image/edit`

/** Fallback catalog used when the gateway is unreachable or the user is offline. */
export const FALLBACK_IMAGE_MODELS = [
  { value: "google/gemini-2.5-flash-image", label: "Gemini 2.5 Flash Image" },
  { value: "google/gemini-3-pro-image-preview", label: "Gemini 3 Pro Image Preview" },
  { value: "openai/gpt-5.4-image-2", label: "GPT-5.4 Image 2" },
  { value: "black-forest-labs/flux.2-flex", label: "Black Forest Labs FLUX.2 Flex" },
  { value: "black-forest-labs/flux.2-klein-4b", label: "Black Forest Labs FLUX.2 Klein 4B" },
] as const

export const DEFAULT_MODEL = "google/gemini-2.5-flash-image"

/** Kept for test compatibility. */
export const IMAGE_MODELS = FALLBACK_IMAGE_MODELS

export type ImageFormat = "png" | "jpeg"

const DATA_URL_RE = /^data:image\/(png|jpeg|jpg);base64,(.+)$/

export function parseImageResponse(body: string): { format: ImageFormat; base64: string } | null {
  let json: unknown
  try {
    json = JSON.parse(body)
  } catch {
    return null
  }
  const image = (json as any)?.image
  if (typeof image !== "string") return null
  const m = image.match(DATA_URL_RE)
  if (!m) return null
  const format = (m[1] === "jpg" ? "jpeg" : m[1]) as ImageFormat
  return { format, base64: m[2] }
}

export function ensureExtension(relPath: string, format: ImageFormat): string {
  const ext = format === "jpeg" ? "jpg" : format
  const match = relPath.match(/\.([a-z]+)$/i)
  if (!match) return `${relPath}.${ext}`
  const existing = match[1].toLowerCase()
  const imageExts = ["png", "jpg", "jpeg"]
  if (!imageExts.includes(existing)) return `${relPath}.${ext}`
  const matches = ext === "jpg" ? ["jpg", "jpeg"] : ["png"]
  if (matches.includes(existing)) return relPath
  return `${relPath.slice(0, -match[0].length)}.${ext}`
}

export function buildMultipartBody(
  boundary: string,
  prompt: string,
  model: string,
  imageBuf: Buffer,
  filename: string,
): Buffer {
  const parts: Buffer[] = []
  const eol = Buffer.from("\r\n")
  const dash = Buffer.from("--")

  const appendField = (name: string, value: string) => {
    parts.push(dash, Buffer.from(boundary), eol)
    parts.push(Buffer.from(`Content-Disposition: form-data; name="${name}"`), eol, eol)
    parts.push(Buffer.from(value), eol)
  }

  const mime = filename.endsWith(".png") ? "image/png" : "image/jpeg"

  appendField("prompt", prompt)
  appendField("model", model)

  parts.push(dash, Buffer.from(boundary), eol)
  parts.push(Buffer.from(`Content-Disposition: form-data; name="images[]"; filename="${filename}"`), eol)
  parts.push(Buffer.from(`Content-Type: ${mime}`), eol, eol)
  parts.push(imageBuf, eol)
  parts.push(dash, Buffer.from(boundary), dash, eol)

  return Buffer.concat(parts)
}

const Parameters = Schema.Struct({
  prompt: Schema.String.annotate({ description: "Text description of the image to generate or the edits to apply. 1-2000 characters." }),
  path: Schema.String.annotate({
    description: "Filesystem path (relative to the workspace) where the resulting image should be saved",
  }),
  image: Schema.optional(Schema.String).annotate({
    description:
      "Optional path (relative to the workspace) to an existing image to edit; supports PNG, JPG, JPEG, GIF, and WEBP",
  }),
  model: Schema.optional(Schema.String).annotate({
    description: "Model ID to use for image generation. Omit to use the configured default.",
  }),
  aspectRatio: Schema.optional(Schema.String).annotate({
    description: "Aspect ratio for the generated image, e.g. '1:1', '16:9', '9:16'. Omit for model default.",
  }),
  imageSize: Schema.optional(Schema.String).annotate({
    description: "Image size/quality, e.g. '1K', '2K', '4K'. Depends on model support. Omit for model default.",
  }),
})

type Meta = {
  format?: ImageFormat
  filepath?: string
  error?: string
}

export const GenerateImageTool = Tool.define(
  "generate_image",
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const authSvc = yield* Auth.Service
    const configSvc = yield* Config.Service
    const http = yield* HttpClient.HttpClient

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const instance = yield* InstanceState.context

          const auth = yield* authSvc.get("klepa").pipe(Effect.catch(() => Effect.succeed(undefined)))
          const cfg = yield* configSvc.get()
          const key =
            (auth?.type === "api" ? auth.key : undefined) ??
            cfg.provider?.klepa?.options?.apiKey ??
            cfg.provider?.["gpt-chat-by"]?.options?.apiKey ??
            process.env[GPT_CHAT_BY_ENV_KEY]

          if (!key) {
            return {
              title: "Image generation unavailable",
              output: "No API key available. Set GPT_CHAT_BY_API_KEY environment variable or configure a klepa provider API key.",
              metadata: { error: "no-key" } as Meta,
            }
          }

          const model = params.model ?? cfg.experimental?.image_generation_model ?? DEFAULT_MODEL
          const isEdit = !!params.image

          let inputImageBuf: Buffer | undefined
          let inputImageName: string
          if (params.image) {
            const imgPath = path.isAbsolute(params.image) ? params.image : path.join(instance.directory, params.image)
            yield* assertExternalDirectoryEffect(ctx, imgPath)
            inputImageBuf = yield* Effect.tryPromise(() => readFile(imgPath))
            inputImageName = path.basename(imgPath)
          }

          yield* ctx.metadata({
            title: isEdit
              ? `Edit image "${params.prompt.slice(0, 60)}"`
              : `Generate image "${params.prompt.slice(0, 60)}"`,
          })

          let response
          if (isEdit && inputImageBuf) {
            const boundary = `----FormBoundary${Math.random().toString(36).slice(2)}`
            const multipart = buildMultipartBody(boundary, params.prompt, model, inputImageBuf, inputImageName!)
            response = yield* http.execute(
              HttpClientRequest.post(IMAGE_EDIT_URL).pipe(
                HttpClientRequest.setHeader("Authorization", `Bearer ${key}`),
                HttpClientRequest.setHeader("Content-Type", `multipart/form-data; boundary=${boundary}`),
                HttpClientRequest.bodyUint8Array(new Uint8Array(multipart)),
              ),
            )
          } else {
            const body: Record<string, unknown> = { prompt: params.prompt, model }
            if (params.aspectRatio) body.aspectRatio = params.aspectRatio
            if (params.imageSize) body.imageSize = params.imageSize
            response = yield* http.execute(
              HttpClientRequest.post(IMAGE_GEN_URL).pipe(
                HttpClientRequest.setHeader("Authorization", `Bearer ${key}`),
                HttpClientRequest.setHeader("Content-Type", "application/json"),
                HttpClientRequest.bodyText(JSON.stringify(body), "application/json"),
              ),
            )
          }

          const status = response.status
          if (status < 200 || status >= 300) {
            const errText = yield* response.text
            log.warn("image generation failed", { status, errText: errText.slice(0, 200) })
            return {
              title: "Image generation failed",
              output: `Image generation request failed (HTTP ${status}).`,
              metadata: { error: "http-error" } as Meta,
            }
          }

          const text = yield* response.text
          const parsed = parseImageResponse(text)
          if (!parsed) {
            return {
              title: "Image generation produced no image",
              output: "The model did not return an image. Try a different prompt or model.",
              metadata: { error: "no-image" } as Meta,
            }
          }

          const finalPath = ensureExtension(params.path, parsed.format)
          const absPath = path.isAbsolute(finalPath) ? finalPath : path.join(instance.directory, finalPath)
          yield* assertExternalDirectoryEffect(ctx, absPath)
          yield* ctx.ask({
            permission: "write",
            patterns: [path.relative(instance.worktree, absPath)],
            always: ["*"],
            metadata: { filepath: absPath },
          })

          const buf = Buffer.from(parsed.base64, "base64")
          yield* fs.writeWithDirs(absPath, buf)

          return {
            title: path.relative(instance.worktree, absPath),
            output: `Image saved to ${finalPath}.`,
            metadata: {
              format: parsed.format,
              filepath: absPath,
            } as Meta,
            attachments: [
              {
                type: "file" as const,
                mime: `image/${parsed.format}`,
                url: `file://${absPath}`,
                filename: path.basename(absPath),
              },
            ],
          }
        }).pipe(Effect.orDie),
    }
  }),
)
