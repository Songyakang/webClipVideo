import { createContext, useContext } from "react";

interface GenerateImageOptions {
  size?: string;
  steps?: number;
  cfgScale?: number;
  negativePrompt?: string;
}

interface GenerateContextValue {
  generateImage: (nodeId: string, prompt: string, model: string, options?: GenerateImageOptions) => Promise<void>;
  generatingNodeId: string | null;
}

export const GenerateContext = createContext<GenerateContextValue>({
  generateImage: async () => {},
  generatingNodeId: null,
});

export function useGenerateContext() {
  return useContext(GenerateContext);
}
