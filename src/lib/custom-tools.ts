import type { McpServer, McpTool } from '../modules/types';

const STORAGE_KEY = 'mcpServers';

// Callback-based storage for Firefox MV2 compat
function loadFromStorage(): Promise<McpServer[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      resolve(result?.[STORAGE_KEY] || []);
    });
  });
}

function saveToStorage(servers: McpServer[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: servers }, () => resolve());
  });
}

export async function loadMcpServers(): Promise<McpServer[]> {
  return loadFromStorage();
}

export async function saveMcpServer(server: McpServer): Promise<void> {
  const servers = await loadFromStorage();
  const idx = servers.findIndex((s) => s.id === server.id);
  if (idx >= 0) {
    servers[idx] = server;
  } else {
    servers.push(server);
  }
  await saveToStorage(servers);
}

export async function deleteMcpServer(id: string): Promise<void> {
  const servers = await loadFromStorage();
  await saveToStorage(servers.filter((s) => s.id !== id));
}

/** Parse an MCP response — handles both plain JSON and SSE format */
async function parseMcpResponse(res: Response): Promise<any> {
  const text = await res.text();

  // Try SSE format first: "event: message\ndata: {...}"
  const dataMatch = text.match(/^data:\s*(.+)$/m);
  if (dataMatch) {
    return JSON.parse(dataMatch[1]);
  }

  // Fall back to plain JSON
  return JSON.parse(text);
}

/** Resolve the MCP endpoint — try /mcp (FastMCP) then root / (custom) */
async function resolveMcpEndpoint(baseUrl: string): Promise<string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  };
  // Use initialize as probe — FastMCP requires it before any other call
  const body = JSON.stringify({
    jsonrpc: '2.0', id: 0, method: 'initialize',
    params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'OpenLens', version: '1.0' } },
  });

  const errors: string[] = [];

  // Try /mcp first (FastMCP streamable HTTP)
  const mcpUrl = baseUrl.replace(/\/$/, '') + '/mcp';
  try {
    console.log('[OpenLens MCP] Probing', mcpUrl);
    const res = await fetch(mcpUrl, { method: 'POST', headers, body });
    console.log('[OpenLens MCP] Probe /mcp status:', res.status);
    if (res.ok) return mcpUrl;
    errors.push(`/mcp: HTTP ${res.status}`);
  } catch (err) {
    console.log('[OpenLens MCP] Probe /mcp error:', err);
    errors.push(`/mcp: ${err}`);
  }

  // Fall back to root / (custom Node.js servers)
  try {
    console.log('[OpenLens MCP] Probing', baseUrl);
    const res = await fetch(baseUrl, { method: 'POST', headers, body });
    console.log('[OpenLens MCP] Probe / status:', res.status);
    if (res.ok) return baseUrl;
    errors.push(`/: HTTP ${res.status}`);
  } catch (err) {
    console.log('[OpenLens MCP] Probe / error:', err);
    errors.push(`/: ${err}`);
  }

  throw new Error(`Could not find MCP endpoint at /mcp or / — ${errors.join('; ')}`);
}

/** Connect to an MCP server: discover endpoint + list tools */
export async function connectMcpServer(url: string): Promise<{ serverInfo: any; tools: McpTool[]; serverId: string }> {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  };

  // Resolve the actual MCP endpoint
  const endpoint = await resolveMcpEndpoint(url);

  // 1. Try to get server info via initialize (optional — some servers skip this)
  let serverInfo = { name: 'Unknown', version: '0' };
  try {
    const initRes = await fetch(endpoint, {
      method: 'POST', headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    });
    if (initRes.ok) {
      const initData = await parseMcpResponse(initRes);
      serverInfo = initData.result?.serverInfo || serverInfo;
    }
  } catch {}

  const serverId = `mcp_${serverInfo.name}_${Date.now()}`;

  // 2. List tools
  const toolsRes = await fetch(endpoint, {
    method: 'POST', headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
  });
  if (!toolsRes.ok) throw new Error(`tools/list failed: ${toolsRes.status}`);
  const toolsData = await parseMcpResponse(toolsRes);
  const rawTools = toolsData.result?.tools || [];

  const tools: McpTool[] = rawTools.map((t: any) => ({
    name: t.name,
    description: t.description || '',
    serverId,
    serverName: serverInfo.name,
    inputSchema: t.inputSchema || { type: 'object', properties: {}, required: [] },
  }));

  return { serverInfo, tools, serverId };
}

/** Call a tool on an MCP server */
export async function callMcpTool(
  serverUrl: string,
  toolName: string,
  args: Record<string, any>,
): Promise<any> {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  };

  // Resolve endpoint (try /mcp then /)
  let endpoint: string;
  try {
    endpoint = await resolveMcpEndpoint(serverUrl);
  } catch {
    endpoint = serverUrl;
  }

  const res = await fetch(endpoint, {
    method: 'POST', headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    }),
  });
  if (!res.ok) throw new Error(`tools/call failed: ${res.status}`);
  const data = await parseMcpResponse(res);
  if (data.result?.isError) {
    throw new Error(data.result.content?.[0]?.text || 'Tool call failed');
  }
  // Extract text content from MCP response format
  const content = data.result?.content || [];
  const text = content.map((c: any) => c.text || JSON.stringify(c)).join('\n');
  return { success: true, data: text };
}

/** Get all tools from all enabled MCP servers */
export async function getAllMcpTools(): Promise<McpTool[]> {
  const servers = await loadFromStorage();
  const tools: McpTool[] = [];
  for (const server of servers) {
    if (server.enabled && server.tools) {
      tools.push(...server.tools);
    }
  }
  return tools;
}
