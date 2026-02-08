import React, { useState, useEffect } from 'react';
import type { ShadowInference, ShadowProfile } from '../../shadow/shadow-engine';
import { groupByCategory } from '../../shadow/shadow-engine';

export default function ShadowProfileView() {
  const [profile, setProfile] = useState<ShadowProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProfile();
    const listener = (changes: any) => {
      if (changes.shadowProfile) {
        setProfile(changes.shadowProfile.newValue);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  function loadProfile() {
    chrome.storage.local.get('shadowProfile', (result) => {
      setProfile(result?.shadowProfile || null);
      setLoading(false);
    });
  }

  function clearProfile() {
    chrome.storage.local.remove('shadowProfile', () => {
      setProfile(null);
    });
  }

  function exportProfile() {
    if (!profile) return;
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `openlens-shadow-profile-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function generateNow() {
    setLoading(true);
    const sendMsg = typeof browser !== 'undefined'
      ? browser.runtime.sendMessage.bind(browser.runtime)
      : chrome.runtime.sendMessage.bind(chrome.runtime);
    sendMsg({ type: 'GENERATE_SHADOW_PROFILE' }).then(() => {
      // Give storage a moment to sync, then reload
      setTimeout(loadProfile, 1000);
    }).catch(() => setLoading(false));
  }

  if (loading) {
    return <div className="text-gray-400 text-sm text-center py-8">Loading...</div>;
  }

  if (!profile || profile.inferences.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
        <h3 className="font-semibold text-lg">No Shadow Profile Yet</h3>
        <p className="text-sm text-gray-400">
          Run a task through the Agent Panel to see what your AI infers about you.
        </p>
        <button
          onClick={generateNow}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded text-sm mt-2"
        >
          Generate from current session
        </button>
      </div>
    );
  }

  const grouped = groupByCategory(profile.inferences);
  const CATEGORY_LABELS: Record<string, string> = {
    financial: 'Financial',
    schedule: 'Schedule',
    preferences: 'Preferences',
    relationships: 'Relationships',
    habits: 'Habits',
    work: 'Work',
    location: 'Location',
    health: 'Health',
  };

  return (
    <div className="space-y-3">
      <div className="text-center mb-3">
        <div className="text-sm text-gray-400">
          After {profile.sessionCount} session{profile.sessionCount !== 1 ? 's' : ''}, your AI has inferred:
        </div>
        <div className="text-2xl font-bold text-purple-400 mt-1">
          {profile.inferences.length} data points
        </div>
      </div>

      {Object.entries(grouped).map(([category, inferences]) => (
        <div key={category} className="bg-gray-900 rounded-lg p-3">
          <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
            <span>{inferences[0]?.icon}</span>
            <span className="uppercase text-xs tracking-wide text-gray-300">{CATEGORY_LABELS[category] || category}</span>
          </h4>
          <div className="space-y-2">
            {inferences.map((inf, i) => (
              <div key={i} className="text-sm">
                <div className="flex items-start gap-2">
                  <span className="text-gray-500">·</span>
                  <div>
                    <span>{inf.inference}</span>
                    <span className={`ml-2 text-xs ${
                      inf.confidence === 'high' ? 'text-green-400' : inf.confidence === 'medium' ? 'text-yellow-400' : 'text-gray-500'
                    }`}>
                      ({inf.confidence})
                    </span>
                    <div className="text-xs text-gray-500 mt-0.5">
                      ↳ {inf.derivedFrom.join(', ')}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="bg-green-900/20 rounded-lg p-3 text-center text-sm text-green-300">
        All inferences derived from LOCAL processing.<br />
        Nothing left your device.
      </div>

      <div className="flex gap-2">
        <button
          onClick={clearProfile}
          className="flex-1 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-300 rounded text-sm"
        >
          Clear
        </button>
        <button
          onClick={exportProfile}
          className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 rounded text-sm"
        >
          Export
        </button>
      </div>
    </div>
  );
}
