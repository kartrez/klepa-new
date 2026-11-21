import { afterEach, describe, expect, test } from "bun:test"
import { configFeatures } from "../../src/features"
import { visible } from "../../webview-ui/src/components/settings/sandboxing"

const features = {
  indexing: false,
  sandboxControls: false,
  autocomplete: false,
  backgroundSubagents: false,
  speechToText: false,
  marketplace: false,
  remoteControl: false,
  integratedBrowser: false,
  projectMemory: false,
  swarm: false,
  codeMode: false,
  caffeination: false,
  nativeNotebookTools: false,
}
const platform = Object.getOwnPropertyDescriptor(process, "platform")

function setPlatform(value: string) {
  Object.defineProperty(process, "platform", { value, configurable: true })
}

afterEach(() => {
  if (platform) Object.defineProperty(process, "platform", platform)
})

describe("Sandboxing settings visibility", () => {
  test("depends only on sandbox control availability", () => {
    expect(visible(features)).toBe(false)
    expect(visible({ ...features, sandboxControls: true })).toBe(true)
  })

  test("edits global sandbox config without promoting project policy", async () => {
    const src = await Bun.file("webview-ui/src/components/settings/SandboxingTab.tsx").text()
    expect(src).toContain("const { globalConfig, updateGlobalConfig } = useConfig()")
    expect(src).toContain("allowed_hosts")
    expect(src).not.toContain("const { config, updateConfig } = useConfig()")
  })

  test("hides sandbox controls on all platforms", () => {
    setPlatform("darwin")
    expect(configFeatures().sandboxControls).toBe(false)

    setPlatform("linux")
    expect(configFeatures().sandboxControls).toBe(false)

    setPlatform("win32")
    expect(configFeatures().sandboxControls).toBe(false)
  })
})
