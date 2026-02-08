export interface HardwareProfile {
  cpuCores: number;
  ramGB: number;
  gpuVendor: string;
  gpuDevice: string;
  vramEstimateGB: number;
  storageAvailableGB: number;
}

export async function scanHardware(): Promise<HardwareProfile> {
  const cpuCores = navigator.hardwareConcurrency || 0;
  const ramGB = (navigator as any).deviceMemory || 0;

  let gpuVendor = 'unknown';
  let gpuDevice = 'unknown';
  let vramEstimateGB = 0;

  try {
    if ('gpu' in navigator) {
      const adapter = await (navigator as any).gpu.requestAdapter();
      if (adapter) {
        const info = adapter.info || (await adapter.requestAdapterInfo?.()) || {};
        gpuVendor = info.vendor || 'unknown';
        gpuDevice = info.device || info.description || 'unknown';
        const maxBuffer = adapter.limits?.maxBufferSize;
        if (maxBuffer) {
          vramEstimateGB = Math.round((maxBuffer / (1024 ** 3)) * 10) / 10;
        }
      }
    }
  } catch {
    // WebGPU not available
  }

  let storageAvailableGB = 0;
  try {
    const estimate = await navigator.storage.estimate();
    storageAvailableGB = Math.round(((estimate.quota || 0) / (1024 ** 3)) * 10) / 10;
  } catch {
    // storage API not available
  }

  return { cpuCores, ramGB, gpuVendor, gpuDevice, vramEstimateGB, storageAvailableGB };
}

export function canRunLocally(profile: HardwareProfile): boolean {
  return profile.cpuCores >= 2 && (profile.ramGB >= 4 || profile.vramEstimateGB >= 4);
}
