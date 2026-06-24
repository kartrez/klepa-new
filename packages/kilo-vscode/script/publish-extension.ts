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
  await $`vsce publish ${flag} --packagePath ${path}`
  console.log(`Published ${name}`)
}

console.log("\nAll VSIX packages published.")
