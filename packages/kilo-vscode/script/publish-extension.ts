#!/usr/bin/env bun
import { $ } from "bun"
import { join } from "node:path"
import { existsSync, readdirSync } from "node:fs"

const out = join(import.meta.dir, "..", "out")
if (!existsSync(out)) throw new Error(`VSIX output directory not found: ${out}`)

const files = readdirSync(out)
  .filter((name) => name.endsWith(".vsix"))
  .sort()

if (!files.length) throw new Error(`no .vsix files found in ${out}`)

const prerelease = process.env.KILO_PRE_RELEASE === "true"
const flag = prerelease ? ["--pre-release"] : []

console.log(`Publishing ${files.length} VSIX file(s)${prerelease ? " (pre-release)" : ""}`)

for (const name of files) {
  const path = join(out, name)
  await $`bun script/verify-vsix.ts ${path}`
  console.log(`\nPublishing ${name}...`)
  // --skip-duplicate: already-published targets of this version (or a client
  // timeout after the marketplace accepted the upload) must not abort the rest.
  await retry(() => $`vsce publish ${flag} --skip-duplicate --packagePath ${path}`, {
    attempts: 3,
    delay: 15_000,
    label: `vsce publish ${name}`,
  })
  console.log(`Published ${name}`)
}

console.log("\nAll VSIX packages published.")

async function retry(fn: () => Promise<unknown>, opts: { attempts: number; delay: number; label: string }) {
  for (let i = 1; i <= opts.attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      const extra = err && typeof err === "object" ? `${(err as { stdout?: string }).stdout ?? ""}\n${(err as { stderr?: string }).stderr ?? ""}` : ""
      const message = `${err instanceof Error ? err.message : String(err)}\n${extra}`
      const retryable = /timeout|ECONNRESET|socket hang up|503|502/i.test(message)
      if (!retryable || i === opts.attempts) throw err
      console.warn(`  ${opts.label} failed (attempt ${i}/${opts.attempts}): ${message.trim()}`)
      console.warn(`  Retrying in ${opts.delay / 1000}s...`)
      await new Promise((r) => setTimeout(r, opts.delay))
    }
  }
}
