import { createContext, useContext, type Accessor, type ParentComponent } from "solid-js"
import type { SpeechToTextModelDef } from "../../../src/speech-to-text/models"

export type SpeechToTextModelsContextValue = {
  models: Accessor<readonly SpeechToTextModelDef[]>
}

const empty = (): readonly SpeechToTextModelDef[] => []

export const SpeechToTextModelsContext = createContext<SpeechToTextModelsContextValue>({
  models: empty,
})

export const SpeechToTextModelsProvider: ParentComponent = (props) => {
  return <SpeechToTextModelsContext.Provider value={{ models: empty }}>{props.children}</SpeechToTextModelsContext.Provider>
}

export function useSpeechToTextModels(): SpeechToTextModelsContextValue {
  return useContext(SpeechToTextModelsContext)
}
