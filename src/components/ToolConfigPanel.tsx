import React, { useState, useEffect } from 'react';
import type { McpServer } from '../modules/types';
import { requestHostPermission } from '../lib/host-permissions';

const BUILT_IN_TOOLS = [
  { name: 'read_page', description: 'Extract and summarize the current page content' },
  { name: 'extract_data', description: 'Extract structured data (prices, links, forms, headings)' },
  { name: 'find_on_page', description: 'Search for specific text on the page' },
  { name: 'navigate', description: 'Open a URL in a new tab' },
  { name: 'fill_form', description: 'Fill form fields (user must submit)' },
  { name: 'click_element', description: 'Click a link or button' },
];

const sendMsg = typeof browser !== 'undefined'
  ? browser.runtime.sendMessage.bind(browser.runtime)
  : chrome.runtime.sendMessage.bind(chrome.runtime);

export default function ToolConfigPanel() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [serverUrl, setServerUrl] = useState('http://localhost:3001');
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  useEffect(() => {
    loadServers();
  }, []);

  function loadServers() {
    sendMsg({ type: 'GET_MCP_SERVERS' }).then((res: any) => {
      setServers(res?.servers || []);
    }).catch(() => {});
  }

  async function handleConnect() {
    if (!serverUrl.trim()) return;
    setConnecting(true);
    setConnectError(null);

    try {
      // Request host permission from the user first
      const granted = await requestHostPermission(serverUrl.trim());
      if (!granted) {
        setConnectError('Permission denied — OpenLens needs access to reach this server');
        setConnecting(false);
        return;
      }

      const res = await sendMsg({ type: 'CONNECT_MCP_SERVER', url: serverUrl.trim() });
      if (res?.ok) {
        setShowAdd(false);
        setServerUrl('http://localhost:3001');
        loadServers();
      } else {
        setConnectError(res?.error || 'Connection failed');
      }
    } catch (err) {
      setConnectError(String(err));
    }
    setConnecting(false);
  }

  async function handleDelete(serverId: string) {
    await sendMsg({ type: 'DELETE_MCP_SERVER', serverId });
    loadServers();
  }

  async function handleToggle(serverId: string) {
    await sendMsg({ type: 'TOGGLE_MCP_SERVER', serverId });
    loadServers();
  }

  const totalMcpTools = servers.filter((s) => s.enabled).reduce((sum, s) => sum + (s.tools?.length || 0), 0);

  return (
    <div className="space-y-4">
      {/* Built-in tools */}
      <div>
        <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Built-in Page Tools (6)</div>
        <div className="space-y-1">
          {BUILT_IN_TOOLS.map((t) => (
            <div key={t.name} className="flex items-center gap-2 text-xs py-1.5 px-2 bg-gray-900/50 rounded">
              <span className="text-green-400 text-[10px]">✓</span>
              <span className="font-medium text-gray-300">{t.name}</span>
              <span className="text-gray-500 truncate">{t.description}</span>
            </div>
          ))}
        </div>
      </div>

      {/* MCP Servers */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs text-gray-500 uppercase tracking-wide">
            MCP Servers ({servers.length}) {totalMcpTools > 0 && <span className="text-green-400">— {totalMcpTools} tools</span>}
          </div>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded"
          >
            {showAdd ? 'Cancel' : '+ Connect Server'}
          </button>
        </div>

        {showAdd && (
          <div className="bg-gray-900 rounded-lg p-3 space-y-2 mb-3 border border-gray-700">
            <div className="text-xs text-gray-400 mb-1">
              Enter the URL of an MCP-compatible tool server.
              <br />
              Example: <code className="text-blue-400">http://localhost:3001</code>
            </div>
            <input
              placeholder="http://localhost:3001"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500 font-mono"
            />
            {connectError && (
              <div className="text-xs text-red-400">{connectError}</div>
            )}
            <button
              onClick={handleConnect}
              disabled={connecting}
              className={`w-full py-1.5 rounded text-sm font-medium ${
                connecting ? 'bg-gray-700 text-gray-400' : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {connecting ? 'Connecting...' : 'Connect & Discover Tools'}
            </button>
            <div className="text-[10px] text-gray-600 leading-tight">
              Try the demo weather server: <code>node mcp-servers/weather-server.js</code>
            </div>
          </div>
        )}

        {servers.length === 0 && !showAdd && (
          <div className="text-xs text-gray-500 text-center py-4">
            No MCP servers connected. Connect one to give your AI new tools.
          </div>
        )}

        {servers.map((server) => (
          <div key={server.id} className="bg-gray-900 rounded-lg p-2.5 mb-2 border border-gray-800">
            <div className="flex items-center gap-2">
              <button onClick={() => handleToggle(server.id)} className="shrink-0">
                {server.enabled
                  ? <span className="text-green-400 text-xs">●</span>
                  : <span className="text-gray-600 text-xs">○</span>}
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-gray-200">{server.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    server.status === 'connected' ? 'bg-green-900/40 text-green-400' :
                    server.status === 'error' ? 'bg-red-900/40 text-red-400' :
                    'bg-gray-800 text-gray-500'
                  }`}>
                    {server.status}
                  </span>
                </div>
                <div className="text-[10px] text-gray-500 font-mono truncate">{server.url}</div>
              </div>
              <button
                onClick={() => handleDelete(server.id)}
                className="shrink-0 text-red-400 hover:text-red-300 text-sm"
              >
                ×
              </button>
            </div>

            {/* Show tools from this server */}
            {server.tools && server.tools.length > 0 && (
              <div className="mt-2 pl-6 space-y-0.5">
                {server.tools.map((tool) => (
                  <div key={tool.name} className="flex items-center gap-2 text-[11px]">
                    <span className="text-blue-400 text-[10px]">T</span>
                    <span className="text-gray-300 font-medium">{tool.name}</span>
                    <span className="text-gray-500 truncate">{tool.description}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
