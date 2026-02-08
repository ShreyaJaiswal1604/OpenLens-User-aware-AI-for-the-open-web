// Curated catalog of popular open-source models with known sizes
// Sizes are approximate — actual varies by quantization

export interface CatalogModel {
  id: string;               // ollama model name
  name: string;             // display name
  family: string;           // model family
  parameterSize: string;    // "8B", "13B", etc.
  sizeGB: number;           // approximate download size in GB
  vramNeeded: number;       // minimum VRAM needed (model + 2GB overhead)
  contextLength: number;    // default context window
  license: string;
  licenseType: 'open' | 'restricted' | 'non-commercial';
  description: string;
  pullCommand: string;
}

export const MODEL_CATALOG: CatalogModel[] = [
  // --- Small (< 4GB VRAM) ---
  {
    id: 'phi3:mini', name: 'Phi-3 Mini', family: 'Phi', parameterSize: '3.8B',
    sizeGB: 2.3, vramNeeded: 4.5, contextLength: 4096, license: 'MIT', licenseType: 'open',
    description: 'Microsoft\'s compact model — great for constrained hardware',
    pullCommand: 'ollama pull phi3:mini',
  },
  {
    id: 'gemma2:2b', name: 'Gemma 2 2B', family: 'Gemma', parameterSize: '2B',
    sizeGB: 1.6, vramNeeded: 3.5, contextLength: 8192, license: 'Gemma License', licenseType: 'restricted',
    description: 'Google\'s lightweight model — fast and efficient',
    pullCommand: 'ollama pull gemma2:2b',
  },
  {
    id: 'qwen2.5:3b', name: 'Qwen 2.5 3B', family: 'Qwen', parameterSize: '3B',
    sizeGB: 1.9, vramNeeded: 4, contextLength: 32768, license: 'Apache 2.0', licenseType: 'open',
    description: 'Alibaba\'s model — impressive for its size, huge context window',
    pullCommand: 'ollama pull qwen2.5:3b',
  },

  // --- Medium (4-8GB VRAM) ---
  {
    id: 'llama3.1:8b', name: 'Llama 3.1 8B', family: 'Llama', parameterSize: '8B',
    sizeGB: 4.7, vramNeeded: 7, contextLength: 8192, license: 'Llama 3.1 Community', licenseType: 'restricted',
    description: 'Meta\'s flagship — best all-rounder at this size',
    pullCommand: 'ollama pull llama3.1:8b',
  },
  {
    id: 'mistral:7b', name: 'Mistral 7B', family: 'Mistral', parameterSize: '7B',
    sizeGB: 4.1, vramNeeded: 6.5, contextLength: 8192, license: 'Apache 2.0', licenseType: 'open',
    description: 'Mistral AI — fully open, strong reasoning',
    pullCommand: 'ollama pull mistral:7b',
  },
  {
    id: 'gemma2:9b', name: 'Gemma 2 9B', family: 'Gemma', parameterSize: '9B',
    sizeGB: 5.4, vramNeeded: 7.5, contextLength: 8192, license: 'Gemma License', licenseType: 'restricted',
    description: 'Google\'s mid-range — strong instruction following',
    pullCommand: 'ollama pull gemma2:9b',
  },
  {
    id: 'qwen2.5:7b', name: 'Qwen 2.5 7B', family: 'Qwen', parameterSize: '7B',
    sizeGB: 4.4, vramNeeded: 6.5, contextLength: 32768, license: 'Apache 2.0', licenseType: 'open',
    description: 'Alibaba\'s 7B — Apache licensed, massive context',
    pullCommand: 'ollama pull qwen2.5:7b',
  },
  {
    id: 'deepseek-r1:8b', name: 'DeepSeek R1 8B', family: 'DeepSeek', parameterSize: '8B',
    sizeGB: 4.9, vramNeeded: 7, contextLength: 8192, license: 'MIT', licenseType: 'open',
    description: 'DeepSeek\'s reasoning model — strong at structured tasks',
    pullCommand: 'ollama pull deepseek-r1:8b',
  },

  // --- Large (8-16GB VRAM) ---
  {
    id: 'llama3.1:13b', name: 'Llama 3.1 13B', family: 'Llama', parameterSize: '13B',
    sizeGB: 7.4, vramNeeded: 10, contextLength: 8192, license: 'Llama 3.1 Community', licenseType: 'restricted',
    description: 'Meta 13B — significantly smarter than 8B, needs more VRAM',
    pullCommand: 'ollama pull llama3.1:13b',
  },
  {
    id: 'mistral-nemo:12b', name: 'Mistral Nemo 12B', family: 'Mistral', parameterSize: '12B',
    sizeGB: 7.1, vramNeeded: 9.5, contextLength: 128000, license: 'Apache 2.0', licenseType: 'open',
    description: 'Mistral + NVIDIA collab — huge 128K context, fully open',
    pullCommand: 'ollama pull mistral-nemo:12b',
  },
  {
    id: 'qwen2.5:14b', name: 'Qwen 2.5 14B', family: 'Qwen', parameterSize: '14B',
    sizeGB: 8.9, vramNeeded: 11, contextLength: 32768, license: 'Apache 2.0', licenseType: 'open',
    description: 'Alibaba 14B — excellent reasoning, Apache licensed',
    pullCommand: 'ollama pull qwen2.5:14b',
  },

  // --- Extra Large (16GB+ VRAM) ---
  {
    id: 'llama3.1:70b', name: 'Llama 3.1 70B', family: 'Llama', parameterSize: '70B',
    sizeGB: 40, vramNeeded: 42, contextLength: 8192, license: 'Llama 3.1 Community', licenseType: 'restricted',
    description: 'Meta\'s largest open model — near-GPT4 quality, massive hardware needed',
    pullCommand: 'ollama pull llama3.1:70b',
  },
  {
    id: 'deepseek-r1:70b', name: 'DeepSeek R1 70B', family: 'DeepSeek', parameterSize: '70B',
    sizeGB: 42, vramNeeded: 44, contextLength: 8192, license: 'MIT', licenseType: 'open',
    description: 'DeepSeek\'s flagship reasoning model — MIT licensed',
    pullCommand: 'ollama pull deepseek-r1:70b',
  },
];

export type Compatibility = 'compatible' | 'tight' | 'incompatible';

export interface ModelWithCompatibility {
  catalog: CatalogModel;
  installed: boolean;
  compatibility: Compatibility;
  compatibilityReason: string;
}

export function checkCompatibility(
  model: CatalogModel,
  vramGB: number,
  ramGB: number
): { compatibility: Compatibility; reason: string } {
  const effectiveMemory = vramGB > 0 ? vramGB : ramGB;
  const memoryType = vramGB > 0 ? 'VRAM' : 'RAM (CPU mode)';

  if (effectiveMemory >= model.vramNeeded + 2) {
    return {
      compatibility: 'compatible',
      reason: `${model.sizeGB}GB model fits comfortably in ${effectiveMemory}GB ${memoryType}`,
    };
  }

  if (effectiveMemory >= model.vramNeeded) {
    return {
      compatibility: 'tight',
      reason: `${model.sizeGB}GB model fits in ${effectiveMemory}GB ${memoryType}, but may be slow`,
    };
  }

  return {
    compatibility: 'incompatible',
    reason: `Needs ~${model.vramNeeded}GB, you have ${effectiveMemory}GB ${memoryType}`,
  };
}

export interface OllamaModelInfo {
  name: string;
  sizeBytes?: number;
  parameterSize?: string;
  family?: string;
}

export function getModelsWithCompatibility(
  vramGB: number,
  ramGB: number,
  installedNames: string[],
  installedDetails?: OllamaModelInfo[]
): ModelWithCompatibility[] {
  const installedSet = new Set(installedNames.map((n) => n.toLowerCase()));

  const results: ModelWithCompatibility[] = MODEL_CATALOG.map((catalog) => {
    const { compatibility, reason } = checkCompatibility(catalog, vramGB, ramGB);
    const installed = installedSet.has(catalog.id.toLowerCase()) ||
      installedNames.some((n) => n.toLowerCase().startsWith(catalog.id.split(':')[0]) && catalog.id.split(':')[0] === n.split(':')[0]);

    // If Ollama has the model installed, it's proven to run — override compatibility
    if (installed) {
      return { catalog, installed, compatibility: 'compatible' as Compatibility, compatibilityReason: 'Installed & running in Ollama' };
    }

    return { catalog, installed, compatibility, compatibilityReason: reason };
  });

  // Add installed models not found in the catalog
  const catalogIds = new Set(MODEL_CATALOG.map((m) => m.id.toLowerCase()));
  const catalogFamilies = new Set(MODEL_CATALOG.map((m) => m.id.split(':')[0].toLowerCase()));

  const unmatchedModels = installedNames.filter((name) => {
    const lower = name.toLowerCase();
    // Not an exact match and not a family prefix match
    return !catalogIds.has(lower) &&
      !MODEL_CATALOG.some((c) => lower.startsWith(c.id.split(':')[0]) && c.id.split(':')[0] === lower.split(':')[0]);
  });

  for (const modelName of unmatchedModels) {
    const detail = installedDetails?.find((d) => d.name === modelName);
    const sizeGB = detail?.sizeBytes ? Math.round(detail.sizeBytes / 1e9 * 10) / 10 : 0;
    const paramSize = detail?.parameterSize || modelName.split(':')[1] || 'unknown';
    const family = detail?.family || modelName.split(':')[0];
    const displayName = `${family.charAt(0).toUpperCase() + family.slice(1)} ${paramSize}`.replace(/:/g, ' ');

    const syntheticCatalog: CatalogModel = {
      id: modelName,
      name: displayName,
      family: family,
      parameterSize: paramSize,
      sizeGB,
      vramNeeded: sizeGB + 2,
      contextLength: 8192,
      license: 'Unknown',
      licenseType: 'open',
      description: `Locally installed model`,
      pullCommand: `ollama pull ${modelName}`,
    };

    // Installed models are proven to run — always compatible
    results.push({
      catalog: syntheticCatalog,
      installed: true,
      compatibility: 'compatible',
      compatibilityReason: 'Installed & running in Ollama',
    });
  }

  return results.sort((a, b) => {
    // Sort: installed first, then compatible, then tight, then incompatible
    if (a.installed !== b.installed) return a.installed ? -1 : 1;
    const order = { compatible: 0, tight: 1, incompatible: 2 };
    if (order[a.compatibility] !== order[b.compatibility]) return order[a.compatibility] - order[b.compatibility];
    return a.catalog.sizeGB - b.catalog.sizeGB;
  });
}
