import { checkPermission, grantPermission, revokeAllForTab, revokePagePermissions, getActivePermissions } from '../lib/permissions';
import { PAGE_TOOLS } from '../agent/page-tools';
import { getAllToolSchemas } from '../agent/tool-schemas';
import { loadMcpServers, saveMcpServer, deleteMcpServer, connectMcpServer, callMcpTool, getAllMcpTools } from '../lib/custom-tools';
import type { PermissionType, PermissionScope, McpServer } from '../modules/types';

export default defineBackground(() => {
  // ---- Types ----
  interface TaskStep {
    id: number;
    title: string;
    description: string;
    tool: string;
    toolParams?: Record<string, string>;
    requiredPermission: string;
    status: string;
    result?: unknown;
    llmOutput?: string;
    isWriteAction: boolean;
    tokens: number;
    origin?: string;
    sensitivity?: string;
  }

  interface TaskPlan {
    intent: string;
    steps: TaskStep[];
    status: string;
    pageContext?: { title: string; url: string; pageType: string; tokenEstimate: number };
  }

  interface SessionState {
    sessionId: string;
    totalTokens: number;
    contextUsed: number;
    contextLimit: number;
    selectedModel: string;
    provider: string;
    processingLocation: string;
    dataEntries: any[];
    auditEvents: any[];
    insights: any[];
    mcpToolCount: number;
  }

  // ---- LLM Provider ----
  type ProviderType = 'ollama' | 'openai' | 'anthropic' | 'openrouter';

  interface LLMConfig {
    provider: ProviderType;
    model: string;
    apiKey?: string;
    ollamaEndpoint?: string;
  }

  let llmConfig: LLMConfig = { provider: 'ollama', model: '' };

  async function llmChat(
    messages: Array<{ role: string; content: string }>,
    options?: { tools?: any[] },
  ): Promise<{ content: string; processingLocation: 'local' | 'cloud'; toolCalls?: any[] }> {
    const { provider, model, apiKey, ollamaEndpoint } = llmConfig;
    console.log('[OpenLens] llmChat called, provider:', provider, 'model:', model, 'tools:', options?.tools?.length || 0);

    switch (provider) {
      case 'ollama': {
        const base = ollamaEndpoint || 'http://localhost:11434';
        const body: any = { model, messages, stream: false };
        if (options?.tools?.length) body.tools = options.tools;
        let res = await fetch(`${base}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        // If model doesn't support tool calling (400), retry without tools
        // and inject tool descriptions into the system prompt instead
        if (!res.ok && res.status === 400 && options?.tools?.length) {
          console.log('[OpenLens] Model does not support tool calling, falling back to prompt-based tools');
          const toolDescriptions = options.tools.map((t: any) =>
            `- ${t.function.name}: ${t.function.description} (params: ${JSON.stringify(t.function.parameters.properties)})`
          ).join('\n');

          const fallbackMessages = messages.map((m) => {
            if (m.role === 'system') {
              const hasPageContent = m.content.includes('Current page content:');
              const toolInstructions = hasPageContent
                ? `\n\nYou already have the page content above. Answer the user's question directly using that content. Do NOT call read_page — you already have it.\n\nIf you need OTHER tools (not read_page), respond with ONLY a JSON object like:\n{"tool": "tool_name", "args": {"param": "value"}}\n\nAvailable tools:\n${toolDescriptions}\n\nIMPORTANT: Answer directly using the page content provided above. Only use a tool JSON if you need something OTHER than page content.`
                : `\n\nYou have access to tools. To call a tool, you MUST respond with ONLY a JSON object like this:\n{"tool": "tool_name", "args": {"param": "value"}}\n\nDo NOT ask the user for information. Do NOT say you need data. Just call the appropriate tool.\n\nAvailable tools:\n${toolDescriptions}\n\nIMPORTANT: If the user asks about a web page, call read_page first. Always respond with a tool call JSON when you need information.`;
              return { ...m, content: m.content + toolInstructions };
            }
            return m;
          });

          const fallbackBody: any = { model, messages: fallbackMessages, stream: false };
          res = await fetch(`${base}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fallbackBody),
          });
          if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
          const data = await res.json();
          const content = data.message?.content || '';

          // Try to parse tool call from content (prompt-based fallback)
          // Handle nested braces by finding matching pairs
          try {
            const startIdx = content.indexOf('{"tool"');
            if (startIdx === -1) throw new Error('no tool json');
            let depth = 0;
            let endIdx = -1;
            for (let ci = startIdx; ci < content.length; ci++) {
              if (content[ci] === '{') depth++;
              if (content[ci] === '}') { depth--; if (depth === 0) { endIdx = ci + 1; break; } }
            }
            if (endIdx > startIdx) {
              const parsed = JSON.parse(content.slice(startIdx, endIdx));
              if (parsed.tool) {
                return {
                  content: '',
                  processingLocation: 'local',
                  toolCalls: [{ function: { name: parsed.tool, arguments: parsed.args || {} } }],
                };
              }
            }
          } catch {}

          return { content, processingLocation: 'local' };
        }

        if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
        const data = await res.json();
        const nativeToolCalls = data.message?.tool_calls;
        if (nativeToolCalls?.length) {
          return { content: data.message.content || '', processingLocation: 'local', toolCalls: nativeToolCalls };
        }

        // No native tool calls — check if model output tool-call JSON as plain text
        const normalContent = data.message?.content || '';
        if (options?.tools?.length) {
          try {
            const si = normalContent.indexOf('{"tool"');
            if (si !== -1) {
              let d = 0, ei = -1;
              for (let ci = si; ci < normalContent.length; ci++) {
                if (normalContent[ci] === '{') d++;
                if (normalContent[ci] === '}') { d--; if (d === 0) { ei = ci + 1; break; } }
              }
              if (ei > si) {
                const p = JSON.parse(normalContent.slice(si, ei));
                if (p.tool) {
                  console.log('[OpenLens] Parsed tool-call JSON from plain text content:', p.tool);
                  return { content: '', processingLocation: 'local', toolCalls: [{ function: { name: p.tool, arguments: p.args || {} } }] };
                }
              }
            }
          } catch {}
        }

        return { content: normalContent, processingLocation: 'local' };
      }
      case 'openai': {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model, messages, max_tokens: 1024 }),
        });
        if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);
        const data = await res.json();
        return { content: data.choices?.[0]?.message?.content || '', processingLocation: 'cloud' };
      }
      case 'anthropic': {
        const systemMsg = messages.find((m) => m.role === 'system')?.content || '';
        const chatMessages = messages.filter((m) => m.role !== 'system');
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey!,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({ model, max_tokens: 1024, system: systemMsg, messages: chatMessages }),
        });
        if (!res.ok) throw new Error(`Anthropic error: ${res.status}`);
        const data = await res.json();
        return { content: data.content?.[0]?.text || '', processingLocation: 'cloud' };
      }
      case 'openrouter': {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://openlens.dev',
            'X-Title': 'OpenLens',
          },
          body: JSON.stringify({ model, messages, max_tokens: 1024 }),
        });
        if (!res.ok) throw new Error(`OpenRouter error: ${res.status}`);
        const data = await res.json();
        return { content: data.choices?.[0]?.message?.content || '', processingLocation: 'cloud' };
      }
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  // ---- Session state ----
  let currentPlan: TaskPlan | null = null;
  let sessionState: SessionState = {
    sessionId: `sess_${Date.now()}`,
    totalTokens: 0,
    contextUsed: 0,
    contextLimit: 8192,
    selectedModel: '',
    provider: 'ollama',
    processingLocation: 'idle',
    dataEntries: [],
    auditEvents: [],
    insights: [],
    mcpToolCount: 0,
  };

  /** Refresh the MCP tool count from storage and sync to UI */
  async function refreshMcpToolCount() {
    const tools = await getAllMcpTools();
    sessionState.mcpToolCount = tools.length;
    syncState();
  }
  // Load initial count
  refreshMcpToolCount();

  // Load config on startup
  chrome.storage.local.get('setupConfig', (result) => {
    if (result.setupConfig) {
      const cfg = result.setupConfig;
      sessionState.selectedModel = cfg.selectedModel;
      sessionState.provider = cfg.provider || 'ollama';
      sessionState.contextLimit = cfg.contextLength || 8192;
      llmConfig = {
        provider: cfg.provider || 'ollama',
        model: cfg.selectedModel,
        apiKey: cfg.apiKey,
        ollamaEndpoint: cfg.ollamaEndpoint,
      };
      console.log('[OpenLens] Config loaded:', llmConfig.provider, llmConfig.model);
    }
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.setupConfig?.newValue) {
      const cfg = changes.setupConfig.newValue;
      sessionState.selectedModel = cfg.selectedModel;
      sessionState.provider = cfg.provider || 'ollama';
      sessionState.contextLimit = cfg.contextLength || 8192;
      llmConfig = {
        provider: cfg.provider || 'ollama',
        model: cfg.selectedModel,
        apiKey: cfg.apiKey,
        ollamaEndpoint: cfg.ollamaEndpoint,
      };
      console.log('[OpenLens] Config updated:', llmConfig.provider, llmConfig.model);
    }
  });

  function addDataEntry(entry: any) {
    const full = {
      ...entry,
      id: `de_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
    };
    sessionState.dataEntries.push(full);
    sessionState.totalTokens += entry.tokenCount || 0;
    sessionState.contextUsed += entry.tokenCount || 0;
    syncState();
  }

  function addAuditEvent(event: any) {
    const full = {
      ...event,
      id: `ae_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
    };
    sessionState.auditEvents.push(full);
    syncState();
  }

  function syncState() {
    chrome.storage.local.set({ sessionState });
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        if (tab.id) {
          sendToTab(tab.id, { type: 'STATE_UPDATE', state: sessionState }).catch(() => {});
        }
      }
    });
  }

  // ---- Tab lifecycle: permission cleanup ----
  chrome.tabs.onRemoved.addListener((tabId) => {
    revokeAllForTab(tabId);
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url) {
      revokePagePermissions(tabId);
    }
  });

  // ---- Permission enforcement ----
  async function ensurePermission(
    tabId: number,
    permType: PermissionType,
    origin: string,
    reason: string,
    sensitivity: string,
  ): Promise<boolean> {
    const existing = await checkPermission(permType, origin, tabId);
    if (existing) return true;

    const isLocal = llmConfig.provider === 'ollama';
    const processingLocation = isLocal ? 'local' : 'cloud';

    // Auto-grant page_read for local providers — data never leaves device
    // This is judgment & restraint: don't pester users when there's no privacy risk
    if (isLocal && permType === 'page_read') {
      await grantPermission(permType, 'session', origin, tabId);
      addAuditEvent({
        type: 'permission_granted',
        origin,
        detail: { permType, scope: 'session', autoGranted: true, reason: 'Local processing — data stays on device' },
        userAction: 'auto',
        processingLocation,
      });
      console.log('[OpenLens] Auto-granted page_read (local provider, no cloud risk)');
      return true;
    }

    addAuditEvent({
      type: 'permission_requested',
      origin,
      detail: { permType, reason, sensitivity },
      processingLocation,
    });

    // For cloud sends and write actions, show the permission dialog
    try {
      const result = await sendToTab(tabId, {
        type: 'SHOW_PERMISSION_DIALOG',
        permType,
        reason,
        sensitivity,
      });

      if (result?.granted) {
        await grantPermission(permType, result.scope as PermissionScope, origin, tabId);
        addAuditEvent({
          type: 'permission_granted',
          origin,
          detail: { permType, scope: result.scope },
          userAction: 'approved',
          processingLocation,
        });
        return true;
      } else {
        addAuditEvent({
          type: 'permission_denied',
          origin,
          detail: { permType },
          userAction: 'denied',
          processingLocation,
        });
        return false;
      }
    } catch (err) {
      console.error('[OpenLens] Permission dialog error:', err);
      // For local page_action, auto-grant as fallback (still logged in audit)
      if (isLocal && permType === 'page_action') {
        await grantPermission(permType, 'page', origin, tabId);
        addAuditEvent({
          type: 'permission_granted',
          origin,
          detail: { permType, scope: 'page', autoGranted: true, reason: 'Dialog unavailable, local provider' },
          processingLocation,
        });
        return true;
      }
      return false;
    }
  }

  // ---- Plan creation ----
  function createFallbackPlan(intent: string): TaskStep[] {
    const lower = intent.toLowerCase();
    const steps: TaskStep[] = [];

    steps.push({
      id: 1,
      title: 'Read current page',
      description: 'Extract and analyze the content of this page',
      tool: 'read_page',
      requiredPermission: 'page_read',
      status: 'pending',
      isWriteAction: false,
      tokens: 0,
    });

    // If user wants to find something specific, add a find step
    const findMatch = lower.match(/find|search|look for|where is|show me|locate/);
    const findTarget = intent.replace(/^.*?(find|search for|look for|where is|show me|locate)\s*/i, '').split(/[.,!?]/)[0].trim();
    if (findMatch && findTarget.length > 2) {
      steps.push({
        id: 2,
        title: `Search for "${findTarget.slice(0, 40)}"`,
        description: `Find "${findTarget}" on this page`,
        tool: 'find_on_page',
        toolParams: { query: findTarget },
        requiredPermission: 'page_read',
        status: 'pending',
        isWriteAction: false,
        tokens: 0,
      });
    }

    steps.push({
      id: steps.length + 1,
      title: 'Analyze and respond',
      description: `Use page content to answer: "${intent}"`,
      tool: 'read_page',
      requiredPermission: 'page_read',
      status: 'pending',
      isWriteAction: false,
      tokens: 0,
    });

    return steps;
  }

  async function generatePlan(intent: string): Promise<TaskStep[]> {
    if (!llmConfig.model) {
      console.log('[OpenLens] No model configured, using fallback plan');
      return createFallbackPlan(intent);
    }

    const toolList = Object.values(PAGE_TOOLS).map(
      (t) => `- ${t.name}: ${t.description} (permission: ${t.requiredPermission}, write: ${t.isWriteAction})`,
    ).join('\n');

    try {
      console.log('[OpenLens] Generating plan via LLM...');
      // Race the LLM call against a 20-second timeout
      const llmPromise = llmChat([
        {
          role: 'system',
          content: `You are a browser agent planner. Given a user intent, create a plan using available tools.

Available tools:
${toolList}

Output a JSON array of steps, each with:
- "title": short action title
- "description": what this step does
- "tool": tool name from the list above
- "toolParams": optional params object (e.g. {"query": "text"} for find_on_page)

Rules:
- Always start with read_page or extract_data
- Use find_on_page for specific searches
- Only use write actions (navigate, fill_form, click_element) when clearly needed
- 2-4 steps maximum
- Output ONLY a valid JSON array`,
        },
        { role: 'user', content: intent },
      ]);

      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 20000));
      const response = await Promise.race([llmPromise, timeoutPromise]);

      if (!response) {
        console.log('[OpenLens] LLM plan generation timed out, using fallback');
        return createFallbackPlan(intent);
      }

      const content = response.content?.trim() || '';
      console.log('[OpenLens] LLM plan response:', content.slice(0, 200));
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.map((step: any, idx: number) => {
          const toolDef = PAGE_TOOLS[step.tool];
          return {
            id: idx + 1,
            title: step.title || `Step ${idx + 1}`,
            description: step.description || '',
            tool: toolDef ? step.tool : 'read_page',
            toolParams: step.toolParams || {},
            requiredPermission: toolDef?.requiredPermission || 'page_read',
            status: 'pending',
            isWriteAction: toolDef?.isWriteAction || false,
            tokens: 0,
          };
        });
      }
      console.log('[OpenLens] Could not parse LLM plan JSON, using fallback');
    } catch (err) {
      console.error('[OpenLens] generatePlan error:', err);
    }

    return createFallbackPlan(intent);
  }

  // ---- Helper: get active tab from background ----
  function getActiveTab(): Promise<chrome.tabs.Tab | null> {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs?.[0] || null);
      });
    });
  }

  // Helper: send message to content script (Firefox MV2 compatible)
  function sendToTab(tabId: number, msg: any): Promise<any> {
    if (typeof browser !== 'undefined' && browser.tabs?.sendMessage) {
      return (browser as any).tabs.sendMessage(tabId, msg);
    }
    return chrome.tabs.sendMessage(tabId, msg);
  }

  // ---- Step execution with real page tools ----
  async function executeStep(stepIdx: number, tabId: number): Promise<TaskStep | null> {
    if (!currentPlan || stepIdx >= currentPlan.steps.length) return null;

    const step = currentPlan.steps[stepIdx];
    step.status = 'running';
    console.log('[OpenLens] executeStep', stepIdx, step.tool, 'tabId:', tabId);

    const isLocal = llmConfig.provider === 'ollama';
    const processingLocation = isLocal ? 'local' : 'cloud';

    // Determine origin from plan context or tab
    let origin = 'unknown';
    try {
      if (currentPlan.pageContext?.url) {
        origin = new URL(currentPlan.pageContext.url).hostname;
      }
    } catch {}

    // Enforce permission
    const permType = (step.requiredPermission || 'page_read') as PermissionType;
    const granted = await ensurePermission(
      tabId, permType, origin,
      `Step "${step.title}": ${step.description}`,
      step.isWriteAction ? 'medium' : 'low',
    );

    if (!granted) {
      step.status = 'skipped';
      step.llmOutput = '(Permission denied by user)';
      return step;
    }

    // For cloud providers, check data_send permission separately
    if (!isLocal) {
      const cloudGranted = await ensurePermission(
        tabId, 'data_send', origin,
        `Send page content to ${llmConfig.provider} for analysis`,
        'high',
      );
      if (!cloudGranted) {
        step.status = 'skipped';
        step.llmOutput = '(Cloud send denied — switch to local Ollama for no-cloud processing)';
        return step;
      }
    }

    // Execute tool via content script
    try {
      let toolResult: any = null;

      switch (step.tool) {
        case 'read_page':
        case 'extract_data': {
          toolResult = await sendToTab(tabId, { type: 'READ_PAGE', maxTokens: 2000 });
          break;
        }
        case 'find_on_page': {
          toolResult = await sendToTab(tabId, {
            type: 'FIND_ON_PAGE',
            query: step.toolParams?.query || step.description,
          });
          break;
        }
        case 'click_element': {
          toolResult = await sendToTab(tabId, {
            type: 'CLICK_ELEMENT',
            selector: step.toolParams?.selector || '',
          });
          break;
        }
        case 'fill_form': {
          let fields = step.toolParams?.fields || {};
          if (typeof fields === 'string') {
            try { fields = JSON.parse(fields); } catch { fields = {}; }
          }
          toolResult = await sendToTab(tabId, { type: 'FILL_FORM', fields });
          break;
        }
        case 'navigate': {
          const url = step.toolParams?.url;
          if (url) {
            await chrome.tabs.create({ url });
            toolResult = { success: true, navigated: url };
          } else {
            toolResult = { success: false, error: 'No URL provided' };
          }
          break;
        }
        default:
          toolResult = { success: false, error: `Unknown tool: ${step.tool}` };
      }

      console.log('[OpenLens] Tool result:', step.tool, toolResult?.success);

      if (!toolResult?.success) {
        step.status = 'completed';
        step.result = toolResult;
        step.llmOutput = `(Tool error: ${toolResult?.error || 'unknown'})`;
        return step;
      }

      // Track data
      const resultData = toolResult.context || toolResult.matches || toolResult;
      const tokenCount = Math.ceil(JSON.stringify(resultData).length / 4);
      const sensitivity = toolResult.context?.structuredData?.emailCount > 0 ? 'medium' : 'low';

      addDataEntry({
        origin, originType: 'page_content', dataType: step.tool,
        tokenCount, sensitivity, entryMethod: 'tool_call',
      });

      addAuditEvent({
        type: 'tool_call', origin,
        detail: { tool: step.tool, params: step.toolParams },
        tokensInvolved: tokenCount, processingLocation,
      });

      sessionState.processingLocation = processingLocation;
      syncState();

      step.result = resultData;
      step.tokens = tokenCount;
      step.origin = origin;
      step.sensitivity = sensitivity;

      // LLM analysis of the extracted data
      if (llmConfig.model) {
        try {
          const previousResults = currentPlan.steps
            .filter((s) => s.status === 'completed' && s.llmOutput)
            .map((s) => `${s.title}: ${s.llmOutput}`);

          const pageData = (step.tool === 'read_page' || step.tool === 'extract_data')
            ? (toolResult.summary || JSON.stringify(resultData).slice(0, 3000))
            : JSON.stringify(resultData).slice(0, 1000);

          const context = previousResults.length > 0
            ? `\nPrevious steps:\n${previousResults.join('\n')}`
            : '';

          const prompt = `Task: "${currentPlan.intent}"\nStep: ${step.title}\nTool: ${step.tool}\n\nPage data:\n${pageData}${context}\n\nProvide a helpful, concise response (3-4 sentences). Answer the user's question directly.`;

          console.log('[OpenLens] Calling LLM for analysis...');
          const response = await llmChat([
            { role: 'system', content: 'You are a helpful AI assistant analyzing real browser page content. Be concise and specific.' },
            { role: 'user', content: prompt },
          ]);

          step.llmOutput = response.content || '(No response)';
          console.log('[OpenLens] LLM response received, length:', step.llmOutput.length);

          const llmTokens = Math.ceil((prompt.length + step.llmOutput.length) / 4);
          addAuditEvent({
            type: 'llm_prompt', origin: 'openlens',
            detail: { step: step.title, provider: llmConfig.provider },
            tokensInvolved: llmTokens, processingLocation: response.processingLocation,
          });
          sessionState.contextUsed += llmTokens;
        } catch (err) {
          console.error('[OpenLens] LLM error:', err);
          step.llmOutput = '(LLM unavailable \u2014 showing raw data)';
        }
      } else {
        step.llmOutput = '(No model configured \u2014 showing raw data)';
      }

      step.status = 'completed';
    } catch (err) {
      console.error('[OpenLens] Step execution error:', err);
      step.status = 'completed';
      step.result = { error: String(err) };
      step.llmOutput = `(Error: ${String(err)})`;
    }

    sessionState.processingLocation = 'idle';
    addAuditEvent({
      type: 'task_step', origin,
      detail: { step: step.title, tool: step.tool },
      processingLocation,
    });
    syncState();
    return step;
  }

  // ---- Cross-origin detection ----
  function detectCrossOrigin(stepIdx: number): string | null {
    if (!currentPlan) return null;
    const completedOrigins = new Set(
      currentPlan.steps
        .filter((s) => s.status === 'completed' && s.origin)
        .map((s) => s.origin)
        .filter(Boolean),
    );
    const currentOrigin = currentPlan.pageContext?.url
      ? new URL(currentPlan.pageContext.url).hostname
      : null;

    if (!currentOrigin || completedOrigins.size === 0) return null;
    if (!completedOrigins.has(currentOrigin)) {
      const origins = [...completedOrigins, currentOrigin];
      const hasHigh = currentPlan.steps.some((s) => s.status === 'completed' && s.sensitivity === 'high');
      const cloudNote = llmConfig.provider !== 'ollama'
        ? ` All this data is being sent to ${llmConfig.provider} cloud servers.`
        : ' Processing is local \u2014 data stays on device.';
      if (hasHigh) {
        return `Data from ${origins.join(' + ')} is merging in the AI context. This includes sensitive data.${cloudNote}`;
      }
      return `Data from ${origins.join(' + ')} is merging in the AI context.${cloudNote}`;
    }
    return null;
  }

  // ---- Shadow profile generation ----
  async function generateShadowProfile() {
    const CATEGORY_ICONS: Record<string, string> = {
      financial: '\u{1F4B0}', schedule: '\u{1F4C5}', preferences: '\u{1F3A7}',
      relationships: '\u{1F464}', habits: '\u{1F4DD}', work: '\u{1F3E2}',
      location: '\u{1F4CD}', health: '\u{2764}\u{FE0F}',
    };

    const fallback = [
      { inference: 'Browsing activity tracked', confidence: 'high' as const, derivedFrom: ['Page content was read during task'], category: 'habits', icon: '\u{1F4DD}' },
    ];

    let inferences = fallback;

    if (llmConfig.model && sessionState.auditEvents.length > 0) {
      try {
        const events = sessionState.auditEvents;
        const dataEntries = sessionState.dataEntries;
        const prompt = `Given the following AI session activity, list personal attributes, preferences, habits, or behaviors that can be INFERRED about the user.

For each inference, output a JSON object with:
- "inference": specific inference (string)
- "confidence": "high", "medium", or "low"
- "derivedFrom": array of strings explaining what data led to this
- "category": one of "financial", "schedule", "preferences", "relationships", "habits", "work"

Output ONLY a JSON array, no other text.

Session activity:
${JSON.stringify(events.map((e: any) => ({ type: e.type, origin: e.origin, detail: e.detail })))}

Data collected:
${JSON.stringify(dataEntries.map((e: any) => ({ origin: e.origin, dataType: e.dataType, sensitivity: e.sensitivity, tokens: e.tokenCount })))}`;

        const response = await llmChat([
          { role: 'system', content: 'You are analyzing what an AI system can INFER about a user from their browsing activity. Output ONLY a valid JSON array.' },
          { role: 'user', content: prompt },
        ]);

        const content = response.content?.trim() || '';
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          inferences = parsed.map((item: any) => ({
            inference: item.inference || '',
            confidence: item.confidence || 'medium',
            derivedFrom: item.derivedFrom || [],
            category: item.category || 'preferences',
            icon: CATEGORY_ICONS[item.category] || '\u{1F50D}',
          }));
        }
      } catch {
        // Use fallback
      }
    }

    const now = Date.now();
    const profileData = {
      shadowProfile: {
        inferences: inferences.map((i: any) => ({ ...i, timestamp: now, sessionId: sessionState.sessionId })),
        firstSeen: now,
        lastUpdated: now,
        sessionCount: 1,
      },
    };
    console.log('[OpenLens] Saving shadow profile:', profileData.shadowProfile.inferences.length, 'inferences');
    return new Promise<void>((resolve) => {
      chrome.storage.local.set(profileData, () => resolve());
    });
  }

  // ---- Tool-call loop (MCP-style) ----
  let toolCallState: {
    running: boolean;
    calls: Array<{ toolName: string; args: any; result: any; iteration: number; timestamp: number }>;
    finalAnswer: string;
    error: string | null;
  } = { running: false, calls: [], finalAnswer: '', error: null };

  async function executeToolCall(
    toolName: string,
    args: Record<string, any>,
    tabId: number,
  ): Promise<any> {
    const isLocal = llmConfig.provider === 'ollama';
    const processingLocation = isLocal ? 'local' : 'cloud';

    // Check if it's a built-in tool
    const builtIn = PAGE_TOOLS[toolName];
    if (builtIn) {
      // Get origin for permission check
      let origin = 'unknown';
      try {
        const tab = await new Promise<chrome.tabs.Tab | null>((resolve) => {
          chrome.tabs.get(tabId, (t) => resolve(t || null));
        });
        if (tab?.url) origin = new URL(tab.url).hostname;
      } catch {}

      const granted = await ensurePermission(
        tabId, builtIn.requiredPermission, origin,
        `Tool "${toolName}": ${builtIn.description}`,
        builtIn.isWriteAction ? 'medium' : 'low',
      );
      if (!granted) return { success: false, error: 'Permission denied' };

      // Route to content script
      switch (toolName) {
        case 'read_page':
        case 'extract_data':
          return sendToTab(tabId, { type: 'READ_PAGE', maxTokens: args.max_tokens || 2000 });
        case 'find_on_page':
          return sendToTab(tabId, { type: 'FIND_ON_PAGE', query: args.query || '' });
        case 'click_element':
          return sendToTab(tabId, { type: 'CLICK_ELEMENT', selector: args.selector || '' });
        case 'fill_form': {
          let fields = args.fields || {};
          if (typeof fields === 'string') try { fields = JSON.parse(fields); } catch {}
          return sendToTab(tabId, { type: 'FILL_FORM', fields });
        }
        case 'navigate':
          if (args.url) {
            await chrome.tabs.create({ url: args.url });
            return { success: true, navigated: args.url };
          }
          return { success: false, error: 'No URL provided' };
        default:
          return { success: false, error: `Unknown built-in tool: ${toolName}` };
      }
    }

    // Check if it's an MCP server tool
    const servers = await loadMcpServers();
    for (const server of servers) {
      if (!server.enabled) continue;
      const mcpTool = server.tools?.find((t) => t.name === toolName);
      if (mcpTool) {
        try {
          console.log(`[OpenLens] Calling MCP tool "${toolName}" on server "${server.name}"`);
          const result = await callMcpTool(server.url, toolName, args);
          return result;
        } catch (err) {
          return { success: false, error: `MCP error: ${String(err)}` };
        }
      }
    }

    return { success: false, error: `Unknown tool: ${toolName}` };
  }

  async function runToolCallLoop(intent: string, tabId: number): Promise<void> {
    const maxIterations = 5;
    toolCallState = { running: true, calls: [], finalAnswer: '', error: null };

    const isLocal = llmConfig.provider === 'ollama';
    const processingLocation = isLocal ? 'local' : 'cloud';

    // Get MCP tools for schema
    const mcpTools = await getAllMcpTools();
    const tools = getAllToolSchemas(mcpTools);

    // Pre-read the page so the LLM always has context (critical for small models)
    let pageContext = '';
    try {
      const pageResult = await sendToTab(tabId, { type: 'READ_PAGE', maxTokens: 2000 });
      if (pageResult?.success && pageResult.summary) {
        pageContext = pageResult.summary;

        const tokenCount = Math.ceil(pageContext.length / 4);
        addDataEntry({
          origin: new URL((await new Promise<chrome.tabs.Tab>((r) => chrome.tabs.get(tabId, r))).url || 'unknown').hostname,
          originType: 'web', dataType: 'page_content',
          tokenCount, sensitivity: 'low', entryMethod: 'tool_call',
        });

        toolCallState.calls.push({
          toolName: 'read_page', args: {}, result: `Read ${tokenCount} tokens from page`,
          iteration: 0, timestamp: Date.now(),
        });
      }
    } catch (err) {
      console.log('[OpenLens] Pre-read failed:', err);
    }

    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: 'You are a helpful browser AI assistant. Be concise and specific.' },
      { role: 'user', content: intent },
    ];

    // Broadcast initial state
    broadcastToolUpdate();

    // If page content was pre-read, try a DIRECT answer first (no tools).
    // This is critical for small models that get confused by tool instructions.
    if (pageContext) {
      try {
        console.log('[OpenLens] Trying direct answer with pre-read page context...');
        const directMessages: Array<{ role: string; content: string }> = [
          {
            role: 'system',
            content: `You are a helpful browser AI assistant analyzing a web page. Answer the user's question directly and concisely using the page content below.\n\nPage content:\n${pageContext}`,
          },
          { role: 'user', content: intent },
        ];
        const directResponse = await llmChat(directMessages); // NO tools param
        const answer = directResponse.content?.trim() || '';

        // If the model gave a real answer (not a tool call JSON), use it
        if (answer && !answer.startsWith('{"tool"') && !answer.startsWith('{\"tool\"') && answer.length > 10) {
          toolCallState.finalAnswer = answer;
          toolCallState.running = false;

          const llmTokens = Math.ceil(answer.length / 4);
          addAuditEvent({
            type: 'llm_prompt', origin: 'openlens',
            detail: { mode: 'direct_answer', iterations: 0 },
            tokensInvolved: llmTokens, processingLocation,
          });

          broadcastToolUpdate();
          console.log('[OpenLens] Direct answer succeeded, length:', answer.length);
          return;
        }
        console.log('[OpenLens] Direct answer was not useful, falling through to tool loop');
      } catch (err) {
        console.log('[OpenLens] Direct answer failed, falling through to tool loop:', err);
      }
    }

    // Tool loop for complex tasks or when direct answer failed
    const systemPrompt = pageContext
      ? `You are a helpful browser AI assistant. You have access to tools. Use tools when needed. Be concise.\n\nCurrent page content:\n${pageContext}`
      : `You are a helpful browser AI assistant. You have access to tools. Use tools when needed (call read_page first if you need page content). Be concise.`;

    messages[0] = { role: 'system', content: systemPrompt };

    for (let i = 0; i < maxIterations; i++) {
      try {
        console.log(`[OpenLens] Tool loop iteration ${i + 1}/${maxIterations}`);
        const response = await llmChat(messages, { tools });

        // If the model returned tool calls
        if (response.toolCalls && response.toolCalls.length > 0) {
          for (const tc of response.toolCalls) {
            const toolName = tc.function?.name || '';
            const toolArgs = tc.function?.arguments || {};

            console.log(`[OpenLens] Tool call: ${toolName}`, toolArgs);

            addAuditEvent({
              type: 'tool_call_start', origin: 'openlens',
              detail: { tool: toolName, args: toolArgs, iteration: i + 1 },
              processingLocation,
            });

            const result = await executeToolCall(toolName, toolArgs, tabId);

            const callRecord = {
              toolName,
              args: toolArgs,
              result: typeof result === 'object' ? JSON.stringify(result).slice(0, 500) : String(result),
              iteration: i + 1,
              timestamp: Date.now(),
            };
            toolCallState.calls.push(callRecord);

            // Track tokens
            const tokenCount = Math.ceil(JSON.stringify(result).length / 4);
            addDataEntry({
              origin: 'openlens', originType: 'local', dataType: `tool:${toolName}`,
              tokenCount, sensitivity: 'low', entryMethod: 'tool_call',
            });

            addAuditEvent({
              type: 'tool_call_result', origin: 'openlens',
              detail: { tool: toolName, success: result?.success },
              tokensInvolved: tokenCount, processingLocation,
            });

            // Feed result back to LLM
            // Use 'user' role for compat with models that don't support 'tool' role
            messages.push({
              role: 'assistant',
              content: `I called the tool "${toolName}" with args ${JSON.stringify(toolArgs)}.`,
            });
            messages.push({
              role: 'user',
              content: `Tool "${toolName}" returned: ${JSON.stringify(result).slice(0, 3000)}\n\nNow continue answering the original question using this result.`,
            });

            broadcastToolUpdate();
          }
        } else {
          // No tool calls — this is the final answer
          toolCallState.finalAnswer = response.content;
          toolCallState.running = false;

          const llmTokens = Math.ceil(response.content.length / 4);
          addAuditEvent({
            type: 'llm_prompt', origin: 'openlens',
            detail: { mode: 'tool_call', iterations: i + 1 },
            tokensInvolved: llmTokens, processingLocation,
          });

          broadcastToolUpdate();
          console.log(`[OpenLens] Tool loop complete after ${i + 1} iterations`);
          return;
        }
      } catch (err) {
        console.error('[OpenLens] Tool loop error:', err);
        toolCallState.error = String(err);
        toolCallState.running = false;
        broadcastToolUpdate();
        return;
      }
    }

    // Hit max iterations
    toolCallState.finalAnswer = '(Reached maximum tool call iterations)';
    toolCallState.running = false;
    broadcastToolUpdate();
  }

  function broadcastToolUpdate() {
    const update = {
      type: 'TOOL_CALL_UPDATE',
      state: {
        running: toolCallState.running,
        callCount: toolCallState.calls.length,
        calls: toolCallState.calls,
        finalAnswer: toolCallState.finalAnswer,
        error: toolCallState.error,
      },
    };
    // Send to all tabs (insights bar)
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        if (tab.id) sendToTab(tab.id, update).catch(() => {});
      }
    });
  }

  // ---- Message handler ----
  // Uses "return Promise" pattern for Firefox MV2 compatibility
  const messageHandler = (msg: any, sender: any): any => {
    try {
    if (msg.type === 'CREATE_PLAN') {
      console.log('[OpenLens] CREATE_PLAN, intent:', msg.intent, 'tabId:', msg.tabId);

      const intent = msg.intent || 'Analyze this page';

      // Reset session
      sessionState.totalTokens = 0;
      sessionState.contextUsed = 0;
      sessionState.dataEntries = [];
      sessionState.auditEvents = [];
      sessionState.insights = [];
      sessionState.sessionId = `sess_${Date.now()}`;

      addAuditEvent({
        type: 'task_started', origin: 'openlens',
        detail: { intent, provider: llmConfig.provider, model: llmConfig.model },
        processingLocation: llmConfig.provider === 'ollama' ? 'local' : 'cloud',
      });

      return (async () => {
        try {
          // 1. Read page context (with 2s timeout so it never hangs)
          let pageContext = { title: 'Unknown', url: '', pageType: 'generic', tokenEstimate: 0 };
          const tabId = msg.tabId;
          if (tabId) {
            try {
              const timeout = new Promise<null>((r) => setTimeout(() => r(null), 2000));
              const readPage = sendToTab(tabId, { type: 'READ_PAGE', maxTokens: 500 }).catch(() => null);
              const pageResult: any = await Promise.race([readPage, timeout]);
              console.log('[OpenLens] Page read:', pageResult?.success ?? 'timeout');
              if (pageResult?.success) {
                pageContext = {
                  title: pageResult.context?.title || 'Unknown',
                  url: pageResult.context?.url || '',
                  pageType: pageResult.context?.pageType || 'generic',
                  tokenEstimate: pageResult.context?.tokenEstimate || 0,
                };
              }
            } catch {}
          }

          // 2. Generate plan via local LLM (with 20s timeout + fallback)
          const steps = await generatePlan(intent);

          currentPlan = { intent, steps, status: 'running', pageContext };
          console.log('[OpenLens] Plan created:', steps.length, 'steps, page:', pageContext.title);
          return { plan: currentPlan };
        } catch (err) {
          console.error('[OpenLens] CREATE_PLAN fatal error:', err);
          const steps = createFallbackPlan(intent);
          currentPlan = { intent, steps, status: 'running' };
          return { plan: currentPlan };
        }
      })();
    }

    if (msg.type === 'EXECUTE_STEP') {
      console.log('[OpenLens] EXECUTE_STEP', msg.stepIdx, 'tabId:', msg.tabId);

      return (async () => {
        try {
          let tabId = msg.tabId;
          if (!tabId) {
            const tab = await getActiveTab();
            tabId = tab?.id;
          }
          if (!tabId) {
            return { step: null, error: 'No active tab found' };
          }
          const step = await executeStep(msg.stepIdx, tabId);
          return { step };
        } catch (err) {
          console.error('[OpenLens] EXECUTE_STEP error:', err);
          return { step: null, error: String(err) };
        }
      })();
    }

    if (msg.type === 'CHECK_CROSS_ORIGIN') {
      return Promise.resolve({ warning: detectCrossOrigin(msg.stepIdx) });
    }

    if (msg.type === 'GENERATE_SHADOW_PROFILE') {
      return generateShadowProfile()
        .then(() => ({ ok: true }))
        .catch(() => ({ ok: false }));
    }

    if (msg.type === 'GET_SESSION_STATE') {
      return Promise.resolve({ state: sessionState });
    }

    if (msg.type === 'GET_PERMISSIONS') {
      return getActivePermissions(msg.tabId)
        .then((perms) => ({ permissions: perms }))
        .catch(() => ({ permissions: [] }));
    }

    if (msg.type === 'CHECK_OLLAMA') {
      const base = msg.endpoint || 'http://localhost:11434';
      return fetch(`${base}/api/tags`)
        .then((res) => ({ running: res.ok }))
        .catch(() => ({ running: false }));
    }

    if (msg.type === 'LIST_OLLAMA_MODELS') {
      const base = msg.endpoint || 'http://localhost:11434';
      return fetch(`${base}/api/tags`)
        .then((res) => res.json())
        .then((data) => ({ models: data.models || [] }))
        .catch(() => ({ models: [] }));
    }

    if (msg.type === 'TOOL_CALL_TASK') {
      console.log('[OpenLens] TOOL_CALL_TASK, intent:', msg.intent);
      return (async () => {
        try {
          let tabId = msg.tabId;
          if (!tabId) {
            const tab = await getActiveTab();
            tabId = tab?.id;
          }
          if (!tabId) return { error: 'No active tab found' };

          // Reset session for new task
          sessionState.totalTokens = 0;
          sessionState.contextUsed = 0;
          sessionState.dataEntries = [];
          sessionState.auditEvents = [];
          sessionState.insights = [];
          sessionState.sessionId = `sess_${Date.now()}`;

          addAuditEvent({
            type: 'task_started', origin: 'openlens',
            detail: { intent: msg.intent, mode: 'tool_call', provider: llmConfig.provider },
            processingLocation: llmConfig.provider === 'ollama' ? 'local' : 'cloud',
          });

          await runToolCallLoop(msg.intent, tabId);
          // Generate shadow profile after tool loop
          await generateShadowProfile();
          return { state: toolCallState };
        } catch (err) {
          return { error: String(err) };
        }
      })();
    }

    if (msg.type === 'GET_TOOL_CALL_STATE') {
      return Promise.resolve({ state: toolCallState });
    }

    if (msg.type === 'GET_MCP_SERVERS') {
      return loadMcpServers().then((servers) => ({ servers }));
    }

    if (msg.type === 'CONNECT_MCP_SERVER') {
      return (async () => {
        try {
          const { serverInfo, tools, serverId } = await connectMcpServer(msg.url);
          const server: McpServer = {
            id: serverId,
            name: serverInfo.name || 'Unknown',
            url: msg.url,
            enabled: true,
            status: 'connected',
            tools,
            lastConnected: Date.now(),
          };
          await saveMcpServer(server);
          addAuditEvent({
            type: 'mcp_discovered', origin: msg.url,
            detail: { server: server.name, toolCount: tools.length, tools: tools.map((t: any) => t.name) },
            processingLocation: 'local',
          });
          await refreshMcpToolCount();
          return { ok: true, server };
        } catch (err) {
          return { ok: false, error: String(err) };
        }
      })();
    }

    if (msg.type === 'DELETE_MCP_SERVER') {
      return deleteMcpServer(msg.serverId).then(async () => {
        await refreshMcpToolCount();
        return { ok: true };
      });
    }

    if (msg.type === 'TOGGLE_MCP_SERVER') {
      return (async () => {
        const servers = await loadMcpServers();
        const server = servers.find((s) => s.id === msg.serverId);
        if (server) {
          server.enabled = !server.enabled;
          await saveMcpServer(server);
          await refreshMcpToolCount();
          return { ok: true, enabled: server.enabled };
        }
        return { ok: false, error: 'Server not found' };
      })();
    }

    if (msg.type === 'OPEN_SIDEPANEL') {
      try {
        if (chrome.sidePanel?.open) {
          if (sender.tab?.windowId) {
            chrome.sidePanel.open({ windowId: sender.tab.windowId });
          } else {
            chrome.windows.getCurrent((w) => {
              if (w.id) chrome.sidePanel.open({ windowId: w.id });
            });
          }
        } else if ((browser as any).sidebarAction?.open) {
          (browser as any).sidebarAction.open();
        }
      } catch {}
      return Promise.resolve({ ok: true });
    }

    } catch (err) {
      console.error('[OpenLens] Message handler top-level error:', err);
      return Promise.resolve({ error: String(err) });
    }
  };

  chrome.runtime.onMessage.addListener(messageHandler);

  console.log('[OpenLens] Background service worker started');
});
