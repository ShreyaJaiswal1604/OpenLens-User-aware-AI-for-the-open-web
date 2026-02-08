import React, { useState, useEffect } from 'react';
import { scanHardware, canRunLocally, type HardwareProfile } from '../../hardware/hardware-scanner';
import { PROVIDERS, type ProviderType } from '../../lib/llm-provider';
import { getModelsWithCompatibility, type ModelWithCompatibility, type CatalogModel, type OllamaModelInfo } from '../../hardware/model-catalog';
import { requestHostPermission } from '../../lib/host-permissions';

interface Props {
  onComplete: () => void;
}

type Screen = 'scanning' | 'model' | 'ready';
const SCREENS: Screen[] = ['scanning', 'model', 'ready'];

export default function SetupWizard({ onComplete }: Props) {
  const [screen, setScreen] = useState<Screen>('scanning');
  const [hardware, setHardware] = useState<HardwareProfile | null>(null);
  const [ollamaReady, setOllamaReady] = useState(false);
  const [installedModels, setInstalledModels] = useState<string[]>([]);
  const [installedDetails, setInstalledDetails] = useState<OllamaModelInfo[]>([]);
  const [catalogModels, setCatalogModels] = useState<ModelWithCompatibility[]>([]);

  // Selection
  const [provider, setProvider] = useState<ProviderType>('ollama');
  const [selectedModel, setSelectedModel] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [scanning, setScanning] = useState(true);

  useEffect(() => {
    doScan();
  }, []);

  async function doScan() {
    setScanning(true);
    const hw = await scanHardware();
    setHardware(hw);

    // Request localhost permission for Ollama detection
    await requestHostPermission('http://localhost:11434');

    // Try direct fetch first, then fallback to background message
    let running = false;
    let installed: string[] = [];
    let details: OllamaModelInfo[] = [];
    const base = 'http://localhost:11434';

    try {
      const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        running = true;
        const data = await res.json();
        const models = data.models || [];
        installed = models.map((m: any) => m.name);
        details = models.map((m: any) => ({
          name: m.name,
          sizeBytes: m.size,
          parameterSize: m.details?.parameter_size,
          family: m.details?.family,
        }));
      }
    } catch {
      // Fallback: route through background script
      try {
        const ollamaStatus = await chrome.runtime.sendMessage({ type: 'CHECK_OLLAMA' });
        running = ollamaStatus?.running ?? false;
        if (running) {
          const result = await chrome.runtime.sendMessage({ type: 'LIST_OLLAMA_MODELS' });
          const models = result?.models || [];
          installed = models.map((m: any) => m.name);
          details = models.map((m: any) => ({
            name: m.name,
            sizeBytes: m.size,
            parameterSize: m.details?.parameter_size,
            family: m.details?.family,
          }));
        }
      } catch {}
    }

    setOllamaReady(running);
    setInstalledModels(installed);
    setInstalledDetails(details);

    const catalog = getModelsWithCompatibility(hw.vramEstimateGB, hw.ramGB, installed, details);
    setCatalogModels(catalog);

    setScanning(false);
  }

  async function finishSetup() {
    const modelName = provider === 'ollama'
      ? (customModel || selectedModel)
      : selectedModel;

    // Request host permission for the selected provider
    if (provider === 'ollama') {
      await requestHostPermission('http://localhost:11434');
    } else if (provider === 'openai') {
      await requestHostPermission('https://api.openai.com');
    } else if (provider === 'anthropic') {
      await requestHostPermission('https://api.anthropic.com');
    } else if (provider === 'openrouter') {
      await requestHostPermission('https://openrouter.ai');
    }

    const config = {
      provider,
      selectedModel: modelName,
      apiKey: apiKey || undefined,
      ollamaEndpoint: 'http://localhost:11434',
      hardwareProfile: hardware,
      benchmark: null,
      contextLength: 8192,
      setupComplete: true,
    };
    await chrome.storage.local.set({ setupConfig: config });
    onComplete();
  }

  const canFinish = provider === 'ollama'
    ? (selectedModel || customModel.trim())
    : (selectedModel && apiKey.trim());

  return (
    <div className="w-[400px] min-h-[500px] bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-800">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <img src="/logo.webp" alt="" className="w-6 h-6 rounded" />
          OpenLens Setup
        </h1>
        <div className="flex gap-1.5 mt-2">
          {SCREENS.map((s, i) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded transition-all ${
                screen === s ? 'bg-blue-500' : i < SCREENS.indexOf(screen) ? 'bg-blue-800' : 'bg-gray-800'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {screen === 'scanning' && (
          <ScanScreen
            hardware={hardware}
            ollamaReady={ollamaReady}
            scanning={scanning}
            onNext={() => setScreen('model')}
          />
        )}
        {screen === 'model' && (
          <ModelScreen
            hardware={hardware!}
            ollamaReady={ollamaReady}
            catalogModels={catalogModels}
            installedModels={installedModels}
            provider={provider}
            onProviderChange={setProvider}
            selectedModel={selectedModel}
            onSelectModel={setSelectedModel}
            customModel={customModel}
            onCustomModelChange={setCustomModel}
            apiKey={apiKey}
            onApiKeyChange={setApiKey}
            canFinish={!!canFinish}
            onNext={() => setScreen('ready')}
            onBack={() => setScreen('scanning')}
          />
        )}
        {screen === 'ready' && (
          <ReadyScreen
            provider={provider}
            selectedModel={customModel || selectedModel}
            catalogModels={catalogModels}
            onFinish={finishSetup}
            onBack={() => setScreen('model')}
          />
        )}
      </div>
    </div>
  );
}

// ---- Hardware Scan Screen ----

function ScanScreen({ hardware, ollamaReady, scanning, onNext }: {
  hardware: HardwareProfile | null;
  ollamaReady: boolean;
  scanning: boolean;
  onNext: () => void;
}) {
  if (scanning) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="text-lg animate-pulse text-blue-400">Scanning...</div>
        <div className="text-lg font-medium">Scanning your hardware...</div>
        <div className="text-sm text-gray-400">Let's see what your machine can do</div>
      </div>
    );
  }

  const hw = hardware!;
  const localCapable = canRunLocally(hw);

  return (
    <div className="space-y-4">
      <div className="text-center mb-2">
        <h2 className="text-lg font-semibold">Hardware Scan</h2>
        <p className="text-sm text-gray-400">Let's see what your machine can do</p>
      </div>

      {/* Hardware grid — matching Lovable style */}
      <div className="grid grid-cols-3 gap-2">
        <HWCard icon="" label="CPU" value={`${hw.cpuCores} cores`} ok={hw.cpuCores >= 2} />
        <HWCard icon="" label="RAM" value={hw.ramGB ? `${hw.ramGB} GB` : 'N/A'} ok={hw.ramGB >= 4} />
        <HWCard icon="" label="GPU" value={hw.gpuVendor !== 'unknown' ? hw.gpuDevice.slice(0, 20) : 'Not detected'} ok={hw.gpuVendor !== 'unknown'} />
        <HWCard icon="" label="VRAM" value={hw.vramEstimateGB ? `~${hw.vramEstimateGB} GB` : 'N/A'} ok={hw.vramEstimateGB >= 4} />
        <HWCard icon="" label="Storage" value={`${hw.storageAvailableGB} GB`} ok={hw.storageAvailableGB > 1} />
        <HWCard icon="" label="Ollama" value={ollamaReady ? 'Detected' : 'Not found'} ok={ollamaReady} />
      </div>

      {/* Verdict */}
      <div className={`p-3 rounded-lg text-center text-sm ${
        localCapable ? 'bg-green-900/30 border border-green-800/30' : 'bg-yellow-900/30 border border-yellow-800/30'
      }`}>
        <div className={`font-medium ${localCapable ? 'text-green-300' : 'text-yellow-300'}`}>
          {localCapable
            ? 'Your machine can run AI locally.'
            : 'Limited hardware — cloud models recommended.'}
        </div>
        {localCapable && (
          <div className="text-xs text-green-400/70 mt-1">Your data stays on YOUR device.</div>
        )}
      </div>

      <button
        onClick={onNext}
        className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium text-sm transition-colors"
      >
        Choose a Model →
      </button>
    </div>
  );
}

function HWCard({ icon, label, value, ok }: { icon: string; label: string; value: string; ok: boolean }) {
  return (
    <div className="bg-gray-900 rounded-lg p-2.5 relative">
      <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
        {icon && <span>{icon}</span>} {label}
      </div>
      <div className="text-sm font-medium truncate">{value}</div>
      <div className={`absolute top-2 right-2 text-xs ${ok ? 'text-green-400' : 'text-gray-600'}`}>{ok ? '✓' : '–'}</div>
    </div>
  );
}

// ---- Model Selection Screen ----

function ModelScreen({
  hardware, ollamaReady, catalogModels, installedModels,
  provider, onProviderChange, selectedModel, onSelectModel,
  customModel, onCustomModelChange, apiKey, onApiKeyChange,
  canFinish, onNext, onBack,
}: {
  hardware: HardwareProfile;
  ollamaReady: boolean;
  catalogModels: ModelWithCompatibility[];
  installedModels: string[];
  provider: ProviderType;
  onProviderChange: (p: ProviderType) => void;
  selectedModel: string;
  onSelectModel: (m: string) => void;
  customModel: string;
  onCustomModelChange: (m: string) => void;
  apiKey: string;
  onApiKeyChange: (k: string) => void;
  canFinish: boolean;
  onNext: () => void;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<'local' | 'cloud'>(ollamaReady ? 'local' : 'cloud');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (tab === 'local') onProviderChange('ollama');
  }, [tab]);

  const compatible = catalogModels.filter((m) => m.compatibility !== 'incompatible');
  const incompatible = catalogModels.filter((m) => m.compatibility === 'incompatible');
  const visibleModels = showAll ? catalogModels : compatible;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-gray-500 hover:text-white text-sm">←</button>
        <h2 className="font-semibold text-lg">Choose Your Model</h2>
      </div>

      {/* Local / Cloud toggle */}
      <div className="flex bg-gray-900 rounded-lg p-1">
        <button
          onClick={() => setTab('local')}
          className={`flex-1 py-1.5 rounded text-sm font-medium transition-colors ${
            tab === 'local' ? 'bg-green-700 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          Local (Ollama)
        </button>
        <button
          onClick={() => setTab('cloud')}
          className={`flex-1 py-1.5 rounded text-sm font-medium transition-colors ${
            tab === 'cloud' ? 'bg-red-700 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          Cloud (API Key)
        </button>
      </div>

      {tab === 'local' && (
        <LocalModelPicker
          ollamaReady={ollamaReady}
          catalogModels={visibleModels}
          selectedModel={selectedModel}
          onSelectModel={(m) => { onSelectModel(m); onCustomModelChange(''); }}
          customModel={customModel}
          onCustomModelChange={(m) => { onCustomModelChange(m); onSelectModel(''); }}
          showAll={showAll}
          onToggleAll={() => setShowAll(!showAll)}
          incompatibleCount={incompatible.length}
        />
      )}

      {tab === 'cloud' && (
        <CloudProviderPicker
          provider={provider}
          onProviderChange={onProviderChange}
          selectedModel={selectedModel}
          onSelectModel={onSelectModel}
          apiKey={apiKey}
          onApiKeyChange={onApiKeyChange}
        />
      )}

      <button
        onClick={onNext}
        disabled={!canFinish}
        className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Continue →
      </button>
    </div>
  );
}

function LocalModelPicker({
  ollamaReady, catalogModels, selectedModel, onSelectModel,
  customModel, onCustomModelChange, showAll, onToggleAll, incompatibleCount,
}: {
  ollamaReady: boolean;
  catalogModels: ModelWithCompatibility[];
  selectedModel: string;
  onSelectModel: (m: string) => void;
  customModel: string;
  onCustomModelChange: (m: string) => void;
  showAll: boolean;
  onToggleAll: () => void;
  incompatibleCount: number;
}) {
  if (!ollamaReady) {
    return (
      <div className="space-y-3">
        <div className="bg-yellow-900/20 border border-yellow-800/30 rounded-lg p-3 text-sm">
          <div className="font-medium text-yellow-300 mb-1">Ollama not detected</div>
          <div className="text-yellow-200/80 text-xs">Install Ollama for local AI processing:</div>
          <code className="block mt-1.5 bg-gray-900 rounded px-2 py-1 text-xs text-blue-400">curl -fsSL https://ollama.com/install.sh | sh</code>
          <div className="text-yellow-200/80 text-xs mt-1.5">Then pull a model:</div>
          <code className="block mt-1 bg-gray-900 rounded px-2 py-1 text-xs text-green-400">ollama pull llama3.1:8b</code>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-gray-400">
        Select a model — compatibility checked against your hardware
      </div>

      <div className="max-h-[220px] overflow-auto space-y-1.5 pr-1">
        {catalogModels.map((m) => (
          <ModelCard
            key={m.catalog.id}
            model={m}
            selected={selectedModel === m.catalog.id}
            onSelect={() => onSelectModel(m.catalog.id)}
          />
        ))}
      </div>

      {incompatibleCount > 0 && (
        <button onClick={onToggleAll} className="text-xs text-gray-500 hover:text-gray-300">
          {showAll ? 'Hide' : `Show ${incompatibleCount}`} incompatible models
        </button>
      )}

      {/* Custom model input */}
      <div className="pt-1 border-t border-gray-800">
        <div className="text-xs text-gray-500 mb-1">Or enter any Ollama model name:</div>
        <input
          type="text"
          value={customModel}
          onChange={(e) => onCustomModelChange(e.target.value)}
          placeholder="e.g. codellama:7b, solar:10.7b ..."
          className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 placeholder-gray-600"
        />
        {customModel && (
          <div className="text-xs text-yellow-400 mt-1">
            Make sure this model is pulled: <code className="bg-gray-900 px-1 rounded">ollama pull {customModel}</code>
          </div>
        )}
      </div>
    </div>
  );
}

function ModelCard({ model, selected, onSelect }: {
  model: ModelWithCompatibility;
  selected: boolean;
  onSelect: () => void;
}) {
  const m = model.catalog;
  const compat = model.compatibility;

  const compatIcon = { compatible: '✓', tight: '~', incompatible: '✗' }[compat];
  const compatColor = { compatible: 'text-green-400', tight: 'text-yellow-400', incompatible: 'text-red-400' }[compat];
  const compatLabel = { compatible: 'Compatible', tight: 'Tight fit', incompatible: 'Too large' }[compat];
  const licenseIcon = { open: '✓', restricted: '~', 'non-commercial': '✗' }[m.licenseType];

  return (
    <button
      onClick={onSelect}
      disabled={compat === 'incompatible'}
      className={`w-full text-left p-2.5 rounded-lg transition-all ${
        selected
          ? 'bg-blue-900/40 border border-blue-500'
          : compat === 'incompatible'
            ? 'bg-gray-900/40 border border-transparent opacity-50 cursor-not-allowed'
            : 'bg-gray-900 border border-transparent hover:border-gray-700'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{m.name}</span>
          {model.installed && (
            <span className="text-[10px] bg-blue-900 text-blue-300 px-1.5 py-0.5 rounded">installed</span>
          )}
        </div>
        <span className={`text-xs ${compatColor}`}>{compatIcon} {compatLabel}</span>
      </div>
      <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
        <span>{m.parameterSize}</span>
        <span>·</span>
        <span>{m.sizeGB}GB</span>
        <span>·</span>
        <span>{licenseIcon} {m.license}</span>
      </div>
      <div className="text-xs text-gray-500 mt-0.5">{model.compatibilityReason}</div>
      {!model.installed && compat !== 'incompatible' && (
        <code className="block mt-1 text-[10px] text-green-400/70 bg-gray-800 rounded px-1.5 py-0.5 w-fit">
          {m.pullCommand}
        </code>
      )}
    </button>
  );
}

function CloudProviderPicker({
  provider, onProviderChange, selectedModel, onSelectModel, apiKey, onApiKeyChange,
}: {
  provider: ProviderType;
  onProviderChange: (p: ProviderType) => void;
  selectedModel: string;
  onSelectModel: (m: string) => void;
  apiKey: string;
  onApiKeyChange: (k: string) => void;
}) {
  const cloudProviders: ProviderType[] = ['openai', 'anthropic', 'openrouter'];

  return (
    <div className="space-y-3">
      <div className="bg-red-900/15 border border-red-800/20 rounded-lg p-2.5 text-xs text-red-300">
        Cloud: your data will leave your device. OpenLens will track exactly what is sent.
      </div>

      {/* Provider selection */}
      <div className="space-y-1.5">
        {cloudProviders.map((p) => (
          <button
            key={p}
            onClick={() => {
              onProviderChange(p);
              onSelectModel(PROVIDERS[p].defaultModels[0] || '');
            }}
            className={`w-full text-left p-2.5 rounded-lg transition-colors ${
              provider === p
                ? 'bg-blue-900/40 border border-blue-500'
                : 'bg-gray-900 border border-transparent hover:border-gray-700'
            }`}
          >
            <div className="font-medium text-sm">{PROVIDERS[p].icon} {PROVIDERS[p].name}</div>
            <div className="text-xs text-gray-400 mt-0.5">
              {p === 'openai' && 'GPT-4o, GPT-4o-mini'}
              {p === 'anthropic' && 'Claude Sonnet, Claude Haiku'}
              {p === 'openrouter' && '200+ models (free tier available)'}
            </div>
          </button>
        ))}
      </div>

      {/* API Key */}
      {provider !== 'ollama' && (
        <>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder={`${PROVIDERS[provider].name} API key`}
            className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          />

          {/* Model selection */}
          <div className="space-y-1">
            <div className="text-xs text-gray-400">Model</div>
            {PROVIDERS[provider].defaultModels.map((m) => (
              <button
                key={m}
                onClick={() => onSelectModel(m)}
                className={`w-full text-left p-2 rounded text-sm ${
                  selectedModel === m ? 'bg-blue-900/40 border border-blue-500' : 'bg-gray-900 border border-transparent hover:border-gray-700'
                }`}
              >
                {m}
              </button>
            ))}
            <input
              type="text"
              value={selectedModel}
              onChange={(e) => onSelectModel(e.target.value)}
              placeholder="Or type a custom model ID..."
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
        </>
      )}
    </div>
  );
}

// ---- Ready Screen ----

function ReadyScreen({ provider, selectedModel, catalogModels, onFinish, onBack }: {
  provider: ProviderType;
  selectedModel: string;
  catalogModels: ModelWithCompatibility[];
  onFinish: () => void;
  onBack: () => void;
}) {
  const isLocal = provider === 'ollama';
  const catalogEntry = catalogModels.find((m) => m.catalog.id === selectedModel);

  return (
    <div className="space-y-4 flex flex-col items-center justify-center h-full">
      <h2 className="font-semibold text-xl">Ready to Go</h2>

      <div className="bg-gray-900 rounded-lg p-4 w-full space-y-2.5">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Provider</span>
          <span>{isLocal ? 'Ollama (Local)' : PROVIDERS[provider].name}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Model</span>
          <span className="font-medium">{selectedModel}</span>
        </div>
        {catalogEntry && (
          <>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Size</span>
              <span>{catalogEntry.catalog.sizeGB}GB · {catalogEntry.catalog.parameterSize}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">License</span>
              <span>{catalogEntry.catalog.license}</span>
            </div>
          </>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Privacy</span>
          <span className={isLocal ? 'text-green-400' : 'text-red-400'}>
            {isLocal ? 'Data stays on device' : 'Data sent to cloud'}
          </span>
        </div>
      </div>

      <p className="text-sm text-gray-400 text-center">
        OpenLens will monitor AI activity and show you what your AI knows about you.
      </p>

      <button
        onClick={onFinish}
        className="w-full py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold text-base transition-colors"
      >
        Start OpenLens
      </button>
      <button onClick={onBack} className="text-xs text-gray-500 hover:text-gray-300">
        ← Change model
      </button>
    </div>
  );
}
