import type { OllamaModel } from '../lib/ollama';
import type { HardwareProfile } from './hardware-scanner';

export interface ModelRecommendation {
  model: OllamaModel;
  fits: boolean;
  reason: string;
  recommended: boolean;
  license: string;
}

const LICENSES: Record<string, string> = {
  llama: 'Llama Community License',
  mistral: 'Apache 2.0',
  phi: 'MIT',
  gemma: 'Gemma License',
  qwen: 'Apache 2.0',
};

function getModelLicense(name: string): string {
  const lower = name.toLowerCase();
  for (const [key, license] of Object.entries(LICENSES)) {
    if (lower.includes(key)) return license;
  }
  return 'Unknown';
}

function getModelSizeGB(model: OllamaModel): number {
  return model.size / (1024 ** 3);
}

export function recommendModels(
  models: OllamaModel[],
  hardware: HardwareProfile
): ModelRecommendation[] {
  const vram = hardware.vramEstimateGB;
  const ram = hardware.ramGB;

  return models.map((model) => {
    const sizeGB = getModelSizeGB(model);
    const fitsVRAM = vram > 0 && vram > sizeGB + 2;
    const fitsRAM = ram > sizeGB + 2;
    const fits = fitsVRAM || fitsRAM;

    let reason = '';
    if (fitsVRAM) {
      reason = `Fits in GPU VRAM (${sizeGB.toFixed(1)}GB model + 2GB overhead < ${vram}GB VRAM)`;
    } else if (fitsRAM) {
      reason = `Fits in RAM (${sizeGB.toFixed(1)}GB model, ${ram}GB RAM available, CPU mode)`;
    } else {
      reason = `May be too large (${sizeGB.toFixed(1)}GB model, ${vram || ram}GB available)`;
    }

    // Recommend smaller models that fit well
    const paramSize = model.details?.parameter_size || '';
    const isSmallEnough =
      (vram >= 10 && parseFloat(paramSize) <= 13) ||
      (vram >= 6 && parseFloat(paramSize) <= 8) ||
      (vram >= 4 && parseFloat(paramSize) <= 4) ||
      parseFloat(paramSize) <= 3;

    return {
      model,
      fits,
      reason,
      recommended: fits && isSmallEnough,
      license: getModelLicense(model.name),
    };
  }).sort((a, b) => {
    if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
    if (a.fits !== b.fits) return a.fits ? -1 : 1;
    return getModelSizeGB(a.model) - getModelSizeGB(b.model);
  });
}
