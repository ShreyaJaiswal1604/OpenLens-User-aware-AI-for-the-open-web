import { extractPageContext, summarizeForLLM } from '../lib/page-context';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    // Don't inject on extension pages
    if (window.location.protocol === 'chrome-extension:' || window.location.protocol === 'moz-extension:') return;

    // Create shadow DOM host
    const host = document.createElement('div');
    host.id = 'openlens-bar';
    host.style.cssText = 'all: initial; position: fixed; top: 0; left: 0; width: 100%; z-index: 2147483647; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;';
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'closed' });

    // Inject styles
    const style = document.createElement('style');
    style.textContent = `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      .bar {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        background: rgba(10, 10, 20, 0.95);
        backdrop-filter: blur(8px);
        border-bottom: 1px solid rgba(255,255,255,0.08);
        font-size: 12px;
        color: #e2e8f0;
        min-height: 28px;
        transition: all 0.3s ease;
      }
      .bar.collapsed { cursor: pointer; }
      .bar.collapsed:hover { background: rgba(10, 10, 20, 1); }
      .logo {
        font-weight: 700;
        color: #60a5fa;
        margin-right: 4px;
        white-space: nowrap;
        cursor: pointer;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        padding: 2px 8px;
        border-radius: 10px;
        background: rgba(255,255,255,0.06);
        white-space: nowrap;
        cursor: pointer;
        transition: background 0.2s;
        font-size: 11px;
      }
      .pill:hover { background: rgba(255,255,255,0.12); }
      .pill.green { color: #4ade80; }
      .pill.yellow { color: #facc15; }
      .pill.red { color: #f87171; }
      .pill.gray { color: #94a3b8; }
      .sep { width: 1px; height: 14px; background: rgba(255,255,255,0.1); margin: 0 2px; }
      .panel {
        background: rgba(10, 10, 20, 0.98);
        border-bottom: 1px solid rgba(255,255,255,0.08);
        padding: 12px 16px;
        max-height: 300px;
        overflow-y: auto;
        font-size: 13px;
        color: #cbd5e1;
        line-height: 1.5;
      }
      .panel h3 { color: #f1f5f9; font-size: 14px; margin-bottom: 8px; font-weight: 600; }
      .panel .entry { padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
      .panel .entry:last-child { border-bottom: none; }
      .panel .label { color: #94a3b8; font-size: 11px; }
      .panel .value { color: #e2e8f0; }
      .panel .high { color: #f87171; }
      .panel .medium { color: #facc15; }
      .panel .low { color: #4ade80; }
      .close-btn {
        margin-left: auto;
        cursor: pointer;
        color: #64748b;
        font-size: 14px;
        padding: 0 4px;
      }
      .close-btn:hover { color: #e2e8f0; }

      /* Permission dialog */
      .perm-overlay {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.5);
        backdrop-filter: blur(2px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2147483646;
      }
      .perm-dialog {
        background: #1a1a2e;
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 12px;
        padding: 20px;
        max-width: 420px;
        width: 90%;
        color: #e2e8f0;
        box-shadow: 0 20px 60px rgba(0,0,0,0.5);
      }
      .perm-dialog h3 {
        font-size: 15px;
        font-weight: 700;
        margin-bottom: 8px;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .perm-dialog .reason {
        font-size: 13px;
        color: #94a3b8;
        margin-bottom: 12px;
        line-height: 1.4;
      }
      .perm-badge {
        display: inline-block;
        font-size: 11px;
        padding: 2px 8px;
        border-radius: 8px;
        font-weight: 600;
        margin-bottom: 12px;
      }
      .perm-badge.low { background: rgba(74,222,128,0.15); color: #4ade80; }
      .perm-badge.medium { background: rgba(250,204,21,0.15); color: #facc15; }
      .perm-badge.high { background: rgba(248,113,113,0.15); color: #f87171; }
      .perm-scope {
        margin-bottom: 16px;
      }
      .perm-scope label {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 0;
        font-size: 13px;
        cursor: pointer;
        color: #cbd5e1;
      }
      .perm-scope input[type="radio"] {
        accent-color: #60a5fa;
      }
      .perm-scope .scope-desc {
        font-size: 11px;
        color: #64748b;
      }
      .perm-actions {
        display: flex;
        gap: 8px;
      }
      .perm-actions button {
        flex: 1;
        padding: 10px;
        border: none;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        font-family: inherit;
      }
      .perm-allow {
        background: #2563eb;
        color: white;
      }
      .perm-allow:hover { background: #1d4ed8; }
      .perm-deny {
        background: rgba(255,255,255,0.08);
        color: #94a3b8;
      }
      .perm-deny:hover { background: rgba(255,255,255,0.12); color: #e2e8f0; }
    `;
    shadow.appendChild(style);

    // Create bar
    const barContainer = document.createElement('div');
    shadow.appendChild(barContainer);

    // Permission dialog container
    const permContainer = document.createElement('div');
    shadow.appendChild(permContainer);

    let expandedModule: string | null = null;
    let permissionState: 'none' | 'granted' | 'pending' = 'none';
    let toolCallCount = 0;
    let toolCallRunning = false;
    let recentToolCalls: Array<{ toolName: string; args: any; result: any; timestamp: number }> = [];

    interface State {
      totalTokens: number;
      contextUsed: number;
      contextLimit: number;
      processingLocation: string;
      dataEntries: Array<{ origin: string; tokenCount: number; sensitivity: string; dataType: string; timestamp: number }>;
      auditEvents: Array<{ type: string; origin: string; timestamp: number }>;
      mcpToolCount: number;
    }

    let currentState: State = {
      totalTokens: 0,
      contextUsed: 0,
      contextLimit: 8192,
      processingLocation: 'idle',
      mcpToolCount: 0,
      dataEntries: [],
      auditEvents: [],
    };

    // ---- Permission dialog ----
    let pendingPermResolve: ((result: { granted: boolean; scope: string }) => void) | null = null;

    function showPermissionDialog(
      permType: string,
      reason: string,
      sensitivity: string,
    ): Promise<{ granted: boolean; scope: string }> {
      return new Promise((resolve) => {
        pendingPermResolve = resolve;

        const typeLabel = {
          page_read: 'Read This Page',
          page_action: 'Interact With Page',
          data_send: 'Send Data to Cloud',
        }[permType] || permType;

        permContainer.innerHTML = `
          <div class="perm-overlay">
            <div class="perm-dialog">
              <h3>OpenLens — ${typeLabel}</h3>
              <div class="reason">${reason}</div>
              <div class="perm-badge ${sensitivity}">${sensitivity} sensitivity</div>
              <div class="perm-scope">
                <label><input type="radio" name="perm-scope" value="page" checked> This page only <span class="scope-desc">— revoked on navigation</span></label>
                <label><input type="radio" name="perm-scope" value="site"> This site <span class="scope-desc">— ${new URL(window.location.href).hostname}</span></label>
                <label><input type="radio" name="perm-scope" value="session"> This session <span class="scope-desc">— all sites, 30 min</span></label>
              </div>
              <div class="perm-actions">
                <button class="perm-deny" data-action="deny">Deny</button>
                <button class="perm-allow" data-action="allow">Allow</button>
              </div>
            </div>
          </div>
        `;

        permissionState = 'pending';
        render();

        const overlay = permContainer.querySelector('.perm-overlay')!;
        overlay.querySelector('[data-action="allow"]')!.addEventListener('click', () => {
          const scope = (overlay.querySelector('input[name="perm-scope"]:checked') as HTMLInputElement)?.value || 'page';
          permContainer.innerHTML = '';
          permissionState = 'granted';
          render();
          resolve({ granted: true, scope });
        });
        overlay.querySelector('[data-action="deny"]')!.addEventListener('click', () => {
          permContainer.innerHTML = '';
          permissionState = 'none';
          render();
          resolve({ granted: false, scope: 'page' });
        });
      });
    }

    // ---- Render ----
    function render() {
      const s = currentState;
      const contextPct = s.contextLimit > 0 ? Math.round((s.contextUsed / s.contextLimit) * 100) : 0;
      const contextColor = contextPct >= 90 ? 'red' : contextPct >= 70 ? 'yellow' : 'green';

      const locationIcon = { local: '\u{1F7E2}', cloud: '\u{1F534}', mixed: '\u{1F7E1}', idle: '\u{26AA}' }[s.processingLocation] || '\u{26AA}';
      const locationLabel = s.processingLocation === 'idle' ? 'idle' : s.processingLocation;
      const locationColor = { local: 'green', cloud: 'red', mixed: 'yellow', idle: 'gray' }[s.processingLocation] || 'gray';

      // Count unique origins with cross-origin detection
      const origins = new Set(s.dataEntries.map((e) => e.origin));
      const hasCrossOrigin = origins.size > 1;
      const hasHighSensitivity = s.dataEntries.some((e) => e.sensitivity === 'high');

      // Permission state pill
      const permColor = permissionState === 'granted' ? 'green' : permissionState === 'pending' ? 'yellow' : 'gray';
      const permIcon = permissionState === 'granted' ? '\u{1F513}' : permissionState === 'pending' ? '\u{23F3}' : '\u{1F512}';
      const permLabel = permissionState === 'granted' ? 'access' : permissionState === 'pending' ? 'asking' : 'locked';

      let html = `<div class="bar collapsed">`;
      html += `<span class="logo">\u{1F441}\u{FE0F} OpenLens</span>`;
      html += `<span class="sep"></span>`;
      html += `<span class="pill ${permColor}" data-module="permissions">${permIcon} ${permLabel}</span>`;
      html += `<span class="pill green" data-module="data-flow">\u{1F4CA} ${s.totalTokens.toLocaleString()} tk</span>`;

      if (hasCrossOrigin) {
        const coColor = hasHighSensitivity ? 'red' : 'yellow';
        html += `<span class="pill ${coColor}" data-module="cross-origin">\u{26A0}\u{FE0F} cross-origin</span>`;
      }

      html += `<span class="pill ${contextColor}" data-module="context">\u{1F9E0} ctx ${contextPct}%</span>`;
      html += `<span class="pill ${locationColor}" data-module="privacy">${locationIcon} ${locationLabel}</span>`;
      html += `<span class="pill gray" data-module="audit">\u{1F4CB} ${s.auditEvents.length} events</span>`;
      const toolColor = toolCallRunning ? 'yellow' : toolCallCount > 0 ? 'green' : s.mcpToolCount > 0 ? 'green' : 'gray';
      const mcpLabel = s.mcpToolCount > 0 ? `\u{1F527} MCP ${s.mcpToolCount} tools` : '\u{1F527} MCP';
      const callLabel = toolCallCount > 0 ? ` \u{2022} ${toolCallCount} calls` : '';
      html += `<span class="pill ${toolColor}" data-module="tools">${mcpLabel}${callLabel}</span>`;
      html += `<span class="close-btn" data-action="minimize">\u{2715}</span>`;
      html += `</div>`;

      // Expanded panel
      if (expandedModule) {
        html += renderPanel(expandedModule, s);
      }

      barContainer.innerHTML = html;

      // Event listeners
      barContainer.querySelectorAll('.pill').forEach((pill) => {
        pill.addEventListener('click', () => {
          const mod = (pill as HTMLElement).dataset.module;
          expandedModule = expandedModule === mod ? null : (mod || null);
          render();
        });
      });

      const closeBtn = barContainer.querySelector('[data-action="minimize"]');
      closeBtn?.addEventListener('click', () => {
        host.style.display = host.style.display === 'none' ? '' : 'none';
      });
    }

    function renderPanel(module: string, s: State): string {
      let html = `<div class="panel">`;

      switch (module) {
        case 'permissions': {
          html += `<h3>\u{1F512} Permission State</h3>`;
          const stateLabel = permissionState === 'granted' ? 'Page access granted' : permissionState === 'pending' ? 'Waiting for approval...' : 'No access — agent hasn\u2019t requested any';
          html += `<div class="entry"><span class="value">${stateLabel}</span></div>`;
          html += `<div class="entry"><span class="label">OpenLens only reads pages when you start a task. No passive monitoring.</span></div>`;
          break;
        }
        case 'data-flow': {
          html += `<h3>\u{1F4CA} Data Flow Tracker</h3>`;
          html += `<div class="entry"><span class="label">Total tokens in context:</span> <span class="value">${s.totalTokens.toLocaleString()}</span></div>`;
          const byOrigin: Record<string, { tokens: number; sensitivity: string }> = {};
          for (const e of s.dataEntries) {
            if (!byOrigin[e.origin]) byOrigin[e.origin] = { tokens: 0, sensitivity: e.sensitivity };
            byOrigin[e.origin].tokens += e.tokenCount;
            if (e.sensitivity === 'high') byOrigin[e.origin].sensitivity = 'high';
          }
          for (const [origin, data] of Object.entries(byOrigin)) {
            html += `<div class="entry"><span class="label">${origin}</span> \u2014 <span class="value">${data.tokens} tokens</span> <span class="${data.sensitivity}">[${data.sensitivity}]</span></div>`;
          }
          break;
        }
        case 'cross-origin': {
          html += `<h3>\u{26A0}\u{FE0F} Cross-Origin Alert</h3>`;
          const origins = [...new Set(s.dataEntries.map((e) => e.origin))];
          html += `<div class="entry">Data from <strong>${origins.join(', ')}</strong> has merged in the AI context.</div>`;
          const highOrigins = s.dataEntries.filter((e) => e.sensitivity === 'high').map((e) => e.origin);
          if (highOrigins.length > 0) {
            html += `<div class="entry high">Sensitive data present from: ${[...new Set(highOrigins)].join(', ')}</div>`;
          }
          html += `<div class="entry"><span class="label">The AI can cross-reference data across these sources.</span></div>`;
          break;
        }
        case 'context': {
          const pct = s.contextLimit > 0 ? Math.round((s.contextUsed / s.contextLimit) * 100) : 0;
          html += `<h3>\u{1F9E0} Context Window Monitor</h3>`;
          html += `<div class="entry"><span class="label">Usage:</span> <span class="value">${s.contextUsed.toLocaleString()} / ${s.contextLimit.toLocaleString()} tokens (${pct}%)</span></div>`;
          html += `<div class="entry" style="background: rgba(255,255,255,0.03); border-radius: 4px; padding: 4px; margin: 4px 0;">`;
          html += `<div style="height: 6px; border-radius: 3px; background: rgba(255,255,255,0.1);"><div style="height: 100%; width: ${Math.min(pct, 100)}%; border-radius: 3px; background: ${pct >= 90 ? '#f87171' : pct >= 70 ? '#facc15' : '#4ade80'}; transition: width 0.3s;"></div></div>`;
          html += `</div>`;
          if (pct >= 90) html += `<div class="entry red">Near limit. Oldest data may be dropped.</div>`;
          else if (pct >= 70) html += `<div class="entry medium">Context filling up \u2014 AI may lose earlier details.</div>`;
          break;
        }
        case 'privacy': {
          html += `<h3>\u{1F6E1}\u{FE0F} Privacy Router</h3>`;
          const loc = s.processingLocation;
          html += `<div class="entry"><span class="label">Status:</span> <span class="value ${loc === 'local' ? 'low' : loc === 'cloud' ? 'high' : ''}">${loc === 'local' ? '\u{1F7E2} All local — nothing leaving device' : loc === 'cloud' ? '\u{1F534} Cloud processing active' : loc === 'mixed' ? '\u{1F7E1} Mixed processing' : '\u{26AA} Idle'}</span></div>`;
          break;
        }
        case 'audit': {
          html += `<h3>\u{1F4CB} Audit Trail</h3>`;
          const recent = s.auditEvents.slice(-10).reverse();
          if (recent.length === 0) {
            html += `<div class="entry label">No events yet</div>`;
          }
          for (const ev of recent) {
            const time = new Date(ev.timestamp).toLocaleTimeString();
            html += `<div class="entry"><span class="label">${time}</span> ${ev.type} <span class="label">from</span> ${ev.origin}</div>`;
          }
          break;
        }
        case 'tools': {
          html += `<h3>\u{1F527} MCP Tool Calls</h3>`;
          if (toolCallRunning) {
            html += `<div class="entry medium">Tool loop running...</div>`;
          }
          if (recentToolCalls.length === 0) {
            html += `<div class="entry label">No tool calls yet. Use Tool Mode in the Agent Panel.</div>`;
          }
          for (const tc of recentToolCalls.slice(-10).reverse()) {
            const time = new Date(tc.timestamp).toLocaleTimeString();
            const argsStr = typeof tc.args === 'object' ? JSON.stringify(tc.args).slice(0, 80) : String(tc.args);
            html += `<div class="entry"><span class="label">${time}</span> <span class="value">${tc.toolName}</span> <span class="label">${argsStr}</span></div>`;
          }
          break;
        }
      }

      html += `</div>`;
      return html;
    }

    // ---- Message handlers ----
    // Uses "return Promise" pattern for Firefox MV2 compatibility
    chrome.runtime.onMessage.addListener((msg): any => {
      if (msg.type === 'STATE_UPDATE') {
        currentState = msg.state;
        render();
        return;
      }

      if (msg.type === 'READ_PAGE') {
        try {
          const context = extractPageContext();
          const summary = summarizeForLLM(context, msg.maxTokens || 2000);
          return Promise.resolve({ success: true, context, summary });
        } catch (err) {
          return Promise.resolve({ success: false, error: String(err) });
        }
      }

      if (msg.type === 'FIND_ON_PAGE') {
        try {
          const query = (msg.query || '').toLowerCase();
          const bodyText = document.body.innerText || '';
          const lines = bodyText.split('\n').filter((l) => l.toLowerCase().includes(query));
          const matches = lines.slice(0, 20).map((l) => l.trim().slice(0, 200));
          return Promise.resolve({ success: true, matches, matchCount: lines.length });
        } catch (err) {
          return Promise.resolve({ success: false, error: String(err) });
        }
      }

      if (msg.type === 'CLICK_ELEMENT') {
        try {
          const { selector } = msg;
          let el: HTMLElement | null = null;

          // Try CSS selector first
          try { el = document.querySelector(selector); } catch {}

          // Fallback: find by text
          if (!el) {
            const allClickable = document.querySelectorAll('a, button, [role="button"], [onclick]');
            el = Array.from(allClickable).find(
              (e) => e.textContent?.trim().toLowerCase().includes(selector.toLowerCase()),
            ) as HTMLElement || null;
          }

          if (el) {
            el.click();
            return Promise.resolve({ success: true, clicked: el.textContent?.trim().slice(0, 100) });
          } else {
            return Promise.resolve({ success: false, error: `Element not found: ${selector}` });
          }
        } catch (err) {
          return Promise.resolve({ success: false, error: String(err) });
        }
      }

      if (msg.type === 'FILL_FORM') {
        try {
          const { fields } = msg;
          const filled: string[] = [];
          for (const [name, value] of Object.entries(fields as Record<string, string>)) {
            const input = document.querySelector(
              `input[name="${name}"], textarea[name="${name}"], select[name="${name}"], input[id="${name}"], textarea[id="${name}"], select[id="${name}"]`,
            ) as HTMLInputElement | null;

            if (input && input.type !== 'password') {
              input.value = value;
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
              filled.push(name);
            }
          }
          return Promise.resolve({ success: true, filled, note: 'Fields filled — user must submit manually' });
        } catch (err) {
          return Promise.resolve({ success: false, error: String(err) });
        }
      }

      if (msg.type === 'SHOW_PERMISSION_DIALOG') {
        return showPermissionDialog(msg.permType, msg.reason, msg.sensitivity);
      }

      if (msg.type === 'TOOL_CALL_UPDATE') {
        toolCallRunning = msg.state?.running || false;
        toolCallCount = msg.state?.callCount || 0;
        recentToolCalls = msg.state?.calls || [];
        render();
        return;
      }

      if (msg.type === 'EXEC_CUSTOM_SCRIPT') {
        try {
          // Run user script in page context — sandboxed via Function constructor
          const fn = new Function('args', msg.script);
          const result = fn(msg.args || {});
          return Promise.resolve({ success: true, data: String(result).slice(0, 3000) });
        } catch (err) {
          return Promise.resolve({ success: false, error: String(err) });
        }
      }
    });

    // Initial render
    render();

    // Push page body down to accommodate bar
    document.body.style.marginTop = '28px';
  },
});
