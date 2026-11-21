import { Component, For, Show, createMemo } from "solid-js"
import { Switch } from "@kilocode/kilo-ui/switch"
import { Select } from "@kilocode/kilo-ui/select"
import { TextField } from "@kilocode/kilo-ui/text-field"
import { Card } from "@kilocode/kilo-ui/card"
import { useConfig } from "../../context/config"
import { useLanguage } from "../../context/language"
import { useImageModels } from "../../context/image-models"
import SettingsRow from "./SettingsRow"
import PatternList from "./PatternList"

const ExperimentalTab: Component = () => {
  const { config, settings, updateConfig, applySetting } = useConfig()
  const language = useLanguage()
  const imageModels = useImageModels()

  const experimental = createMemo(() => config().experimental ?? {})

  const updateExperimental = (key: string, value: unknown) => {
    updateConfig({
      experimental: { ...experimental(), [key]: value },
    })
  }

  return (
    <div>
      <Card>
        <SettingsRow
          title={language.t("settings.experimental.formatter.title")}
          description={language.t("settings.experimental.formatter.description")}
        >
          <Switch
            checked={config().formatter !== false}
            onChange={(checked) => updateConfig({ formatter: checked ? {} : false })}
            hideLabel
          >
            {language.t("settings.experimental.formatter.title")}
          </Switch>
        </SettingsRow>

        <SettingsRow
          title={language.t("settings.experimental.lsp.title")}
          description={language.t("settings.experimental.lsp.description")}
        >
          <Switch
            checked={config().lsp !== false}
            onChange={(checked) => updateConfig({ lsp: checked ? {} : false })}
            hideLabel
          >
            {language.t("settings.experimental.lsp.title")}
          </Switch>
        </SettingsRow>

        <SettingsRow
          title={language.t("settings.experimental.batch.title")}
          description={language.t("settings.experimental.batch.description")}
        >
          <Switch
            checked={experimental().batch_tool ?? false}
            onChange={(checked) => updateExperimental("batch_tool", checked)}
            hideLabel
          >
            {language.t("settings.experimental.batch.title")}
          </Switch>
        </SettingsRow>

        <SettingsRow
          title={language.t("settings.experimental.imageGeneration.title")}
          description={language.t("settings.experimental.imageGeneration.description")}
        >
          <Switch
            checked={experimental().image_generation ?? false}
            onChange={(checked) => updateExperimental("image_generation", checked)}
            hideLabel
          >
            {language.t("settings.experimental.imageGeneration.title")}
          </Switch>
        </SettingsRow>

        <Show when={experimental().image_generation}>
          <SettingsRow
            title={language.t("settings.experimental.imageGenerationModel.title")}
            description={language.t("settings.experimental.imageGenerationModel.description")}
          >
            <Select
              options={imageModels.models().map((m) => ({ value: m.id, label: m.name }))}
              current={imageModels
                .models()
                .map((m) => ({ value: m.id, label: m.name }))
                .find((m) => m.value === experimental().image_generation_model)}
              value={(item) => item.value}
              label={(item) => item.label}
              onSelect={(item) => updateExperimental("image_generation_model", item?.value ?? undefined)}
              variant="secondary"
              size="small"
              triggerVariant="settings"
              placeholder={language.t("settings.experimental.imageGenerationModel.placeholder")}
            />
          </SettingsRow>
        </Show>

        <SettingsRow
          title={language.t("settings.experimental.continueOnDeny.title")}
          description={language.t("settings.experimental.continueOnDeny.description")}
        >
          <Switch
            checked={experimental().continue_loop_on_deny ?? false}
            onChange={(checked) => updateExperimental("continue_loop_on_deny", checked)}
            hideLabel
          >
            {language.t("settings.experimental.continueOnDeny.title")}
          </Switch>
        </SettingsRow>

        <SettingsRow
          title={language.t("settings.experimental.agentManagerSplash.title")}
          description={language.t("settings.experimental.agentManagerSplash.description")}
        >
          <Switch
            checked={settings().agentManagerSplash === true}
            onChange={(checked) => applySetting("agentManagerSplash", checked, "experimental.agentManagerSplash")}
            hideLabel
          >
            {language.t("settings.experimental.agentManagerSplash.title")}
          </Switch>
        </SettingsRow>

        <SettingsRow
          title={language.t("settings.experimental.conversationPromptHistory.title")}
          description={language.t("settings.experimental.conversationPromptHistory.description")}
        >
          <Switch
            checked={settings().conversationPromptHistory === true}
            onChange={(checked) =>
              applySetting("conversationPromptHistory", checked, "experimental.conversationPromptHistory")
            }
            hideLabel
          >
            {language.t("settings.experimental.conversationPromptHistory.title")}
          </Switch>
        </SettingsRow>

        {/* MCP timeout */}
        <SettingsRow
          title={language.t("settings.experimental.mcpTimeout.title")}
          description={language.t("settings.experimental.mcpTimeout.description")}
          last
        >
          <TextField
            value={String(experimental().mcp_timeout ?? 60000)}
            onChange={(val) => {
              const num = parseInt(val, 10)
              if (!isNaN(num) && num > 0) {
                updateExperimental("mcp_timeout", num)
              }
            }}
          />
        </SettingsRow>
      </Card>

      <h4
        style={{ "margin-top": "16px", "margin-bottom": "8px" }}
        data-search-label={language.t("settings.experimental.globIncludeIgnored.title")}
      >
        {language.t("settings.experimental.globIncludeIgnored.title")}
      </h4>
      <PatternList
        patterns={experimental().glob_include_ignored ?? []}
        description={language.t("settings.experimental.globIncludeIgnored.description")}
        placeholder="e.g. packages/*/dist"
        onChange={(patterns) => updateExperimental("glob_include_ignored", patterns)}
      />

      {/* Tool toggles */}
      <Show when={config().tools && Object.keys(config().tools ?? {}).length > 0}>
        <h4 style={{ "margin-top": "16px", "margin-bottom": "8px" }}>
          {language.t("settings.experimental.toolToggles")}
        </h4>
        <Card>
          <For each={Object.entries(config().tools ?? {})}>
            {([name, enabled], index) => (
              <SettingsRow title={name} description="" last={index() >= Object.keys(config().tools ?? {}).length - 1}>
                <Switch
                  checked={enabled}
                  onChange={(checked) => updateConfig({ tools: { ...config().tools, [name]: checked } })}
                  hideLabel
                >
                  {name}
                </Switch>
              </SettingsRow>
            )}
          </For>
        </Card>
      </Show>
    </div>
  )
}

export default ExperimentalTab
