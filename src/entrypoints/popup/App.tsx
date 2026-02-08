import React, { useState, useEffect } from 'react';
import SetupWizard from './SetupWizard';
import ShadowProfileView from './ShadowProfileView';
import ToolConfigPanel from '../../components/ToolConfigPanel';

type View = 'loading' | 'setup' | 'main';

export default function App() {
  const [view, setView] = useState<View>('loading');

  useEffect(() => {
    chrome.storage.local.get('setupConfig', (result) => {
      if (result.setupConfig?.setupComplete) {
        setView('main');
      } else {
        setView('setup');
      }
    });
  }, []);

  if (view === 'loading') {
    return (
      <div className="w-[400px] h-[500px] bg-gray-950 text-white flex items-center justify-center">
        <div className="text-lg animate-pulse">Loading...</div>
      </div>
    );
  }

  if (view === 'setup') {
    return <SetupWizard onComplete={() => setView('main')} />;
  }

  return <MainView />;
}

function MainView() {
  const [tab, setTab] = useState<'dashboard' | 'shadow' | 'tools'>('dashboard');

  return (
    <div className="w-[400px] h-[500px] bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold flex items-center gap-2">
            <img src="/logo.webp" alt="" className="w-6 h-6 rounded" />
            OpenLens
          </h1>
          <button
            onClick={() => {
              chrome.storage.local.remove('setupConfig');
              window.location.reload();
            }}
            className="text-xs text-gray-500 hover:text-gray-300"
          >
            Reset
          </button>
        </div>
        <div className="flex gap-1 mt-3">
          <button
            onClick={() => setTab('dashboard')}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              tab === 'dashboard' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setTab('shadow')}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              tab === 'shadow' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            Shadow Profile
          </button>
          <button
            onClick={() => setTab('tools')}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              tab === 'tools' ? 'bg-green-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            MCP
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {tab === 'dashboard' ? <DashboardView /> : tab === 'shadow' ? <ShadowProfileView /> : <ToolConfigPanel />}
      </div>
    </div>
  );
}

function DashboardView() {
  const [config, setConfig] = useState<any>(null);
  const [sessionState, setSessionState] = useState<any>(null);

  useEffect(() => {
    chrome.storage.local.get(['setupConfig', 'sessionState'], (result) => {
      setConfig(result.setupConfig);
      setSessionState(result.sessionState);
    });

    const listener = (changes: any) => {
      if (changes.sessionState) setSessionState(changes.sessionState.newValue);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const hw = config?.hardwareProfile;
  const totalTokens = sessionState?.totalTokens || 0;
  const eventCount = sessionState?.auditEvents?.length || 0;
  const contextPct = sessionState ? Math.round((sessionState.contextUsed / sessionState.contextLimit) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Model info */}
      <div className="bg-gray-900 rounded-lg p-3">
        <div className="text-sm text-gray-400 mb-1">Active Model</div>
        <div className="font-semibold">{config?.selectedModel || 'None'}</div>
        <div className={`text-xs mt-1 ${config?.provider === 'ollama' ? 'text-green-400' : 'text-red-400'}`}>
          {config?.provider === 'ollama' ? '\u{1F7E2} Local processing' : `\u{1F534} Cloud — ${config?.provider || 'unknown'}`}
        </div>
      </div>

      {/* Session stats */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Tokens" value={totalTokens.toLocaleString()} icon={'\u{1F4CA}'} />
        <StatCard label="Context" value={`${contextPct}%`} icon={'\u{1F9E0}'} color={contextPct > 90 ? 'red' : contextPct > 70 ? 'yellow' : 'green'} />
        <StatCard label="Events" value={String(eventCount)} icon={'\u{1F4CB}'} />
      </div>

      {/* Hardware */}
      {hw && (
        <div className="bg-gray-900 rounded-lg p-3">
          <div className="text-sm text-gray-400 mb-2">Hardware</div>
          <div className="grid grid-cols-2 gap-1 text-xs">
            <div>CPU: {hw.cpuCores} cores</div>
            <div>RAM: {hw.ramGB}GB</div>
            <div>GPU: {hw.gpuVendor}</div>
            <div>Storage: {hw.storageAvailableGB}GB</div>
          </div>
        </div>
      )}

      {/* Open side panel */}
      <button
        onClick={() => {
          chrome.runtime.sendMessage({ type: 'OPEN_SIDEPANEL' });
        }}
        className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium text-sm transition-colors"
      >
        Open Panel
      </button>
    </div>
  );
}

function StatCard({ label, value, icon, color = 'blue' }: { label: string; value: string; icon: string; color?: string }) {
  const colorMap: Record<string, string> = {
    blue: 'text-blue-400',
    green: 'text-green-400',
    yellow: 'text-yellow-400',
    red: 'text-red-400',
  };

  return (
    <div className="bg-gray-900 rounded-lg p-2.5 text-center">
      {icon && <div className="text-base">{icon}</div>}
      <div className={`font-bold text-lg ${colorMap[color] || colorMap.blue}`}>{value}</div>
      <div className="text-xs text-gray-400">{label}</div>
    </div>
  );
}
