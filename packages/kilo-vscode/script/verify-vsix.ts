#!/usr/bin/env bun
import { $ } from "bun"

const path = process.argv[2]
if (!path) throw new Error("usage: verify-vsix.ts <path-to.vsix>")

const min = 1_000_000
const required = [
  "extension/package.json",
  "extension/dist/extension.js",
  "extension/dist/webview.js",
  "extension/audio-wav/bip-bop-01.wav",
  "extension/assets/icons/kilo-icon-font.woff2",
]
const forbidden = ["extension/.env", "extension/.env."]

const list = await $`unzip -l ${path}`.text()
const lines = list.split("\n")

const size = (name: string) => {
  const line = lines.find((row) => row.trimEnd().endsWith(` ${name}`))
  if (!line) return
  const match = /^\s*(\d+)/.exec(line)
  if (!match) return
  return Number(match[1])
}

for (const entry of required) {
  if (!list.includes(entry)) throw new Error(`missing required file in ${path}: ${entry}`)
}

for (const entry of forbidden) {
  if (list.includes(entry)) throw new Error(`forbidden file in ${path}: ${entry}`)
}

const binary =
  size("extension/bin/kilo") !== undefined
    ? "extension/bin/kilo"
    : size("extension/bin/kilo.exe") !== undefined
      ? "extension/bin/kilo.exe"
      : undefined

if (!binary) throw new Error(`missing CLI binary in ${path}`)

const bytes = size(binary)
if (bytes === undefined || bytes < min) {
  throw new Error(`CLI binary too small in ${path}: ${bytes ?? 0} bytes (expected >= ${min})`)
}

console.log(`ok: ${path}`)
