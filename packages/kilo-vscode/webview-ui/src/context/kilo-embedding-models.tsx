import { createContext, useContext, type Accessor, type ParentComponent } from "solid-js"
import {
  EMPTY_KILO_EMBEDDING_MODEL_CATALOG,
  type KiloEmbeddingModelCatalog,
} from "@kilocode/kilo-indexing/embedding-models"

type KiloEmbeddingModelsContextValue = {
  catalog: Accessor<KiloEmbeddingModelCatalog>
}

export const KiloEmbeddingModelsContext = createContext<KiloEmbeddingModelsContextValue>()

export const KiloEmbeddingModelsProvider: ParentComponent = (props) => {
  const catalog = () => EMPTY_KILO_EMBEDDING_MODEL_CATALOG
  return <KiloEmbeddingModelsContext.Provider value={{ catalog }}>{props.children}</KiloEmbeddingModelsContext.Provider>
}

export function useKiloEmbeddingModels(): KiloEmbeddingModelsContextValue {
  const context = useContext(KiloEmbeddingModelsContext)
  if (!context) {
    throw new Error("useKiloEmbeddingModels must be used within a KiloEmbeddingModelsProvider")
  }
  return context
}
