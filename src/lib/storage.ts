import { storage } from 'wxt/storage';
import type { ProviderType } from './llm-provider';

export interface SetupConfig {
  provider: ProviderType;
  selectedModel: string;
  apiKey?: string;
  ollamaEndpoint: string;
  hardwareProfile: {
    cpuCores: number;
    ramGB: number;
    gpuVendor: string;
    gpuDevice: string;
    vramEstimateGB: number;
    storageAvailableGB: number;
  };
  benchmark: {
    tokensPerSecond: number;
    modelTested: string;
    timestamp: number;
  } | null;
  contextLength: number;
  setupComplete: boolean;
}

const DEFAULT_CONFIG: SetupConfig = {
  provider: 'ollama',
  selectedModel: '',
  ollamaEndpoint: 'http://localhost:11434',
  hardwareProfile: {
    cpuCores: 0,
    ramGB: 0,
    gpuVendor: 'unknown',
    gpuDevice: 'unknown',
    vramEstimateGB: 0,
    storageAvailableGB: 0,
  },
  benchmark: null,
  contextLength: 8192,
  setupComplete: false,
};

export const setupConfig = storage.defineItem<SetupConfig>('local:setupConfig', {
  fallback: DEFAULT_CONFIG,
});

export const sessionData = storage.defineItem<{
  sessionId: string;
  startTime: number;
  events: unknown[];
}>('local:sessionData', {
  fallback: { sessionId: '', startTime: 0, events: [] },
});
