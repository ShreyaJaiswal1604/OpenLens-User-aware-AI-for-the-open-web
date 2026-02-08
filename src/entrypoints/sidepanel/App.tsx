import React, { useState, useEffect, useRef } from 'react';

/** Lightweight markdown → HTML for LLM output */
function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Headers (must come before bold)
    .replace(/^#### (.+)$/gm, '<h5 class="font-semibold text-sm mt-3 mb-1 text-gray-200">$1</h5>')
    .replace(/^### (.+)$/gm, '<h4 class="font-semibold text-sm mt-3 mb-1 text-gray-100">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 class="font-semibold text-base mt-4 mb-1 text-white">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 class="font-bold text-lg mt-4 mb-1 text-white">$1</h2>')
    // Bold + italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-gray-100">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`(.+?)`/g, '<code class="bg-gray-800 px-1 py-0.5 rounded text-blue-300 text-xs">$1</code>')
    // Bullet lists
    .replace(/^[\*\-]\s+(.+)$/gm, '<li class="ml-4 list-disc text-gray-300">$1</li>')
    // Numbered lists
    .replace(/^\d+\.\s+(.+)$/gm, '<li class="ml-4 list-decimal text-gray-300">$1</li>')
    // Wrap consecutive <li> in <ul>/<ol>
    .replace(/((?:<li class="ml-4 list-disc[^>]*>.*?<\/li>\s*)+)/g, '<ul class="my-1 space-y-0.5">$1</ul>')
    .replace(/((?:<li class="ml-4 list-decimal[^>]*>.*?<\/li>\s*)+)/g, '<ol class="my-1 space-y-0.5">$1</ol>')
    // Paragraphs (double newline)
    .replace(/\n\n/g, '</p><p class="mt-2">')
    // Line breaks
    .replace(/\n/g, '<br/>');
}

function MarkdownContent({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div
      className={`markdown-content ${className}`}
      dangerouslySetInnerHTML={{ __html: `<p>${renderMarkdown(text)}</p>` }}
    />
  );
}

interface TaskStep {
  id: number;
  title: string;
  description: string;
  tool: string;
  toolParams?: Record<string, string>;
  requiredPermission: string;
  status: 'pending' | 'running' | 'awaiting_approval' | 'completed' | 'skipped';
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

type AppState = 'loading' | 'needs-setup' | 'idle' | 'planning' | 'running' | 'completed';

interface ToolCallState {
  running: boolean;
  callCount: number;
  calls: Array<{ toolName: string; args: any; result: any; iteration: number; timestamp: number }>;
  finalAnswer: string;
  error: string | null;
}

export default function App() {
  const [state, setState] = useState<AppState>('loading');
  const [intent, setIntent] = useState('');
  const [plan, setPlan] = useState<TaskPlan | null>(null);
  const [currentStepIdx, setCurrentStepIdx] = useState(-1);
  const [crossOriginWarning, setCrossOriginWarning] = useState<string | null>(null);
  const [writeApproval, setWriteApproval] = useState<TaskStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [toolCallState, setToolCallState] = useState<ToolCallState | null>(null);
  const stepsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chrome.storage.local.get('setupConfig', (result) => {
      if (result.setupConfig?.setupComplete) {
        setState('idle');
      } else {
        setState('needs-setup');
      }
    });

    // Listen for tool call updates from background
    const listener = (msg: any) => {
      if (msg.type === 'TOOL_CALL_UPDATE') {
        setToolCallState(msg.state);
        if (!msg.state.running && (msg.state.finalAnswer || msg.state.error)) {
          setState('completed');
        }
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  // Use browser.runtime for Firefox MV2 compat
  const sendMsg = typeof browser !== 'undefined'
    ? browser.runtime.sendMessage.bind(browser.runtime)
    : chrome.runtime.sendMessage.bind(chrome.runtime);

  async function getActiveTabId(): Promise<number | null> {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs[0]?.id || null);
      });
    });
  }

  async function startTask() {
    const taskIntent = intent || 'What are the key details on this page?';
    setError(null);
    setState('planning');

    try {
      const tabId = await getActiveTabId();
      setActiveTabId(tabId);
      console.log('[OpenLens Sidebar] Starting task, tabId:', tabId);

      const response = await sendMsg({
        type: 'CREATE_PLAN',
        intent: taskIntent,
        tabId,
      });

      console.log('[OpenLens Sidebar] CREATE_PLAN response:', JSON.stringify(response));

      if (response?.plan) {
        setPlan(response.plan);
        setState('running');
        setCurrentStepIdx(0);
        runNextStep(response.plan, 0, tabId);
      } else {
        setError(`No plan in response: ${JSON.stringify(response).slice(0, 200)}`);
        setState('idle');
      }
    } catch (err) {
      console.error('[OpenLens Sidebar] startTask error:', err);
      setError(`Error: ${String(err)}`);
      setState('idle');
    }
  }

  async function startToolTask() {
    const taskIntent = intent || 'What are the key details on this page?';
    setError(null);
    setState('running');
    setToolCallState({ running: true, callCount: 0, calls: [], finalAnswer: '', error: null });

    try {
      const tabId = await getActiveTabId();
      setActiveTabId(tabId);
      console.log('[OpenLens Sidebar] Starting tool task, tabId:', tabId);

      // This will run async — updates come via TOOL_CALL_UPDATE messages
      const response = await sendMsg({
        type: 'TOOL_CALL_TASK',
        intent: taskIntent,
        tabId,
      });

      // Final state comes back here too
      if (response?.state) {
        setToolCallState(response.state);
      }
      if (response?.error) {
        setError(response.error);
      }
      setState('completed');
    } catch (err) {
      console.error('[OpenLens Sidebar] startToolTask error:', err);
      setError(`Error: ${String(err)}`);
      setState('completed');
    }
  }

  async function runNextStep(taskPlan: TaskPlan, stepIdx: number, tabId: number | null) {
    if (stepIdx >= taskPlan.steps.length) {
      setState('completed');
      sendMsg({ type: 'GENERATE_SHADOW_PROFILE' }).catch(() => {});
      return;
    }

    const step = taskPlan.steps[stepIdx];

    try {
      const coResponse = await sendMsg({
        type: 'CHECK_CROSS_ORIGIN',
        stepIdx,
      });

      if (coResponse?.warning) {
        setCrossOriginWarning(coResponse.warning);
        return;
      }
    } catch {}

    if (step.isWriteAction) {
      setWriteApproval(step);
      return;
    }

    await executeCurrentStep(taskPlan, stepIdx, tabId);
  }

  async function executeCurrentStep(taskPlan: TaskPlan, stepIdx: number, tabId: number | null) {
    const tid = tabId || activeTabId || await getActiveTabId();

    try {
      console.log('[OpenLens Sidebar] EXECUTE_STEP', stepIdx, 'tabId:', tid);
      const response = await sendMsg({
        type: 'EXECUTE_STEP',
        stepIdx,
        tabId: tid,
      });

      console.log('[OpenLens Sidebar] EXECUTE_STEP response:', response?.step?.status);

      if (response?.step) {
        const updatedPlan = { ...taskPlan };
        updatedPlan.steps[stepIdx] = response.step;
        setPlan({ ...updatedPlan });
        setCurrentStepIdx(stepIdx + 1);

        setTimeout(() => {
          stepsRef.current?.lastElementChild?.scrollIntoView({ behavior: 'smooth' });
        }, 100);

        setTimeout(() => runNextStep(updatedPlan, stepIdx + 1, tid), 800);
      } else {
        // Step failed — show error but try to continue
        setError(response?.error || 'Step failed');
        setCurrentStepIdx(stepIdx + 1);
        setTimeout(() => runNextStep(taskPlan, stepIdx + 1, tid), 500);
      }
    } catch (err) {
      console.error('[OpenLens Sidebar] executeCurrentStep error:', err);
      setError(`Step error: ${String(err)}`);
      setState('completed');
    }
  }

  function handleCrossOriginDecision(decision: 'allow' | 'stop') {
    setCrossOriginWarning(null);
    if (decision === 'stop') {
      setState('completed');
      return;
    }
    if (plan) executeCurrentStep(plan, currentStepIdx, activeTabId);
  }

  function handleWriteApproval(decision: 'approve' | 'skip') {
    setWriteApproval(null);
    if (decision === 'skip') {
      if (plan) {
        plan.steps[currentStepIdx].status = 'skipped';
        setPlan({ ...plan });
        setCurrentStepIdx(currentStepIdx + 1);
        runNextStep(plan, currentStepIdx + 1, activeTabId);
      }
      return;
    }
    if (plan) executeCurrentStep(plan, currentStepIdx, activeTabId);
  }

  function resetTask() {
    setState('idle');
    setPlan(null);
    setCurrentStepIdx(-1);
    setCrossOriginWarning(null);
    setWriteApproval(null);
    setIntent('');
    setError(null);
    setActiveTabId(null);
    setToolCallState(null);
  }

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-lg animate-pulse">Loading...</div>
      </div>
    );
  }

  if (state === 'needs-setup') {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-8 gap-4">
        <h2 className="text-lg font-semibold">Setup Required</h2>
        <p className="text-sm text-gray-400 text-center">
          Open the OpenLens popup to configure your hardware and select an AI model first.
        </p>
        <button
          onClick={() => {
            chrome.storage.local.get('setupConfig', (result) => {
              if (result.setupConfig?.setupComplete) setState('idle');
            });
          }}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium"
        >
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <h1 className="font-bold flex items-center gap-2">
          <img src="/logo.webp" alt="" className="w-5 h-5 rounded" />
          OpenLens
        </h1>
        {state !== 'idle' && (
          <button onClick={resetTask} className="text-xs text-gray-500 hover:text-gray-300">
            Reset
          </button>
        )}
      </div>

      <div className="p-4">
        {state === 'idle' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              Enter a task. Your AI uses built-in page tools + any connected MCP server tools to answer.
            </p>
            <textarea
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              placeholder="What are the key details on this page?"
              className="w-full h-24 bg-gray-900 border border-gray-700 rounded-lg p-3 text-sm resize-none focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={startToolTask}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium"
            >
              Start Task
            </button>
            <div className="bg-gray-900/50 rounded-lg p-3 text-xs text-gray-500 space-y-1">
              <strong>How it works:</strong>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>LLM decides which tools to call automatically</li>
                <li>Built-in: read page, search, extract data, navigate</li>
                <li>Connect MCP servers for more tools (popup → MCP tab)</li>
                <li>Every tool call shown transparently</li>
              </ul>
            </div>
          </div>
        )}

        {state === 'planning' && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="text-sm animate-pulse text-gray-300">...</div>
            <div className="text-sm text-gray-400">Reading page & planning steps...</div>
          </div>
        )}

        {/* Tool call results */}
        {(state === 'running' || state === 'completed') && toolCallState && (
          <div className="space-y-4">
            <div className="bg-gray-900 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1">Task (Tool Mode)</div>
              <div className="text-sm">{intent || 'Analyzing page...'}</div>
            </div>

            {toolCallState.calls.map((call, idx) => (
              <ToolCallCard key={idx} call={call} />
            ))}

            {toolCallState.running && (
              <div className="flex items-center gap-3 py-4 justify-center">
                <div className="text-sm animate-spin text-gray-300">↻</div>
                <span className="text-sm text-gray-400">
                  LLM thinking... ({toolCallState.callCount} tool{toolCallState.callCount !== 1 ? 's' : ''} called)
                </span>
              </div>
            )}

            {toolCallState.finalAnswer && (
              <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4">
                <div className="text-xs text-blue-400 mb-2 font-semibold">Final Answer</div>
                <MarkdownContent text={toolCallState.finalAnswer} className="text-sm text-gray-200" />
              </div>
            )}

            {toolCallState.error && (
              <div className="bg-red-900/20 border border-red-700 rounded-lg p-3 text-sm text-red-300">
                {toolCallState.error}
              </div>
            )}

            {state === 'completed' && (
              <div className="bg-green-900/20 border border-green-700 rounded-lg p-4 text-center space-y-2">
                <div className="font-semibold text-green-300">Task Complete</div>
                <p className="text-sm text-gray-400">
                  {toolCallState.callCount} tool call{toolCallState.callCount !== 1 ? 's' : ''} made. Check the Shadow Profile to see what your AI inferred.
                </p>
                <button onClick={resetTask} className="mt-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded text-sm">
                  Run Another Task
                </button>
              </div>
            )}
          </div>
        )}

        {/* Plan Mode results (fallback) */}
        {(state === 'running' || state === 'completed') && !toolCallState && plan && (
          <div className="space-y-4">
            <div className="bg-gray-900 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1">Task</div>
              <div className="text-sm">{plan.intent}</div>
              {plan.pageContext && plan.pageContext.title !== 'Unknown' && (
                <div className="mt-2 pt-2 border-t border-gray-800 flex items-center gap-2 text-xs text-gray-500">
                  <span className="truncate">{plan.pageContext.title}</span>
                  <span className="ml-auto shrink-0 px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
                    {plan.pageContext.pageType}
                  </span>
                  <span className="shrink-0 text-gray-600">
                    ~{plan.pageContext.tokenEstimate} tokens
                  </span>
                </div>
              )}
            </div>

            <div ref={stepsRef} className="space-y-3">
              {plan.steps.map((step, idx) => (
                <StepCard key={step.id} step={step} isActive={idx === currentStepIdx && state === 'running'} />
              ))}
            </div>

            {crossOriginWarning && (
              <div className="bg-yellow-900/30 border border-yellow-600 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2 font-semibold text-yellow-300">
                  Cross-Origin Data Merge
                </div>
                <p className="text-sm text-yellow-200">{crossOriginWarning}</p>
                <div className="flex gap-2">
                  <button onClick={() => handleCrossOriginDecision('allow')} className="flex-1 py-2 bg-yellow-600 hover:bg-yellow-700 rounded text-sm font-medium">
                    Allow & Continue
                  </button>
                  <button onClick={() => handleCrossOriginDecision('stop')} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm">
                    Stop Task
                  </button>
                </div>
              </div>
            )}

            {writeApproval && (
              <div className="bg-red-900/20 border border-red-600/50 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2 font-semibold text-red-300">
                  Write Action — Approval Required
                </div>
                <p className="text-sm text-gray-300">{writeApproval.description}</p>
                <div className="text-xs text-gray-500">
                  Tool: <span className="text-gray-400">{writeApproval.tool}</span>
                  {writeApproval.toolParams && Object.keys(writeApproval.toolParams).length > 0 && (
                    <span> | Params: {JSON.stringify(writeApproval.toolParams)}</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleWriteApproval('approve')} className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium">
                    Approve
                  </button>
                  <button onClick={() => handleWriteApproval('skip')} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm">
                    Skip
                  </button>
                </div>
              </div>
            )}

            {state === 'completed' && (
              <div className="bg-green-900/20 border border-green-700 rounded-lg p-4 text-center space-y-2">
                <div className="font-semibold text-green-300">Task Complete</div>
                <p className="text-sm text-gray-400">
                  Check the Shadow Profile to see what your AI inferred about you.
                </p>
                <button onClick={resetTask} className="mt-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded text-sm">
                  Run Another Task
                </button>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mt-4 bg-red-900/20 border border-red-700 rounded-lg p-3 text-sm text-red-300">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolCallCard({ call }: { call: { toolName: string; args: any; result: any; iteration: number; timestamp: number } }) {
  const [showDetails, setShowDetails] = useState(false);

  const toolIcons: Record<string, string> = {
    read_page: 'R',
    extract_data: 'D',
    find_on_page: 'F',
    navigate: 'N',
    fill_form: 'W',
    click_element: 'C',
  };

  const icon = toolIcons[call.toolName] || 'T';
  const argsStr = typeof call.args === 'object' ? JSON.stringify(call.args) : String(call.args);
  const time = new Date(call.timestamp).toLocaleTimeString();

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 p-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-mono bg-gray-800 px-1.5 py-0.5 rounded text-blue-400">{icon}</span>
        <span className="font-medium text-sm">{call.toolName}</span>
        <span className="ml-auto text-xs text-gray-500">#{call.iteration} {time}</span>
      </div>
      {argsStr !== '{}' && (
        <div className="text-xs text-gray-400 ml-6 truncate">{argsStr.slice(0, 100)}</div>
      )}
      <div className="mt-1 ml-6">
        <button onClick={() => setShowDetails(!showDetails)} className="text-xs text-blue-400 hover:text-blue-300">
          {showDetails ? 'Hide result' : 'Show result'}
        </button>
      </div>
      {showDetails && (
        <div className="mt-2 ml-6 bg-gray-800/50 border border-gray-700 rounded p-2.5 text-xs text-gray-300 max-h-40 overflow-y-auto">
          <pre className="whitespace-pre-wrap break-all">{typeof call.result === 'string' ? call.result.slice(0, 800) : JSON.stringify(call.result, null, 2).slice(0, 800)}</pre>
        </div>
      )}
    </div>
  );
}

function StepCard({ step, isActive }: { step: TaskStep; isActive: boolean }) {
  const [showWhy, setShowWhy] = useState(false);

  const statusIcon = {
    pending: '·',
    running: '↻',
    awaiting_approval: '!',
    completed: '✓',
    skipped: '→',
  }[step.status];

  const permIcon = {
    page_read: 'R',
    page_action: 'A',
    data_send: 'C',
  }[step.requiredPermission] || '?';

  return (
    <div className={`rounded-lg border p-3 transition-all ${
      isActive ? 'border-blue-500 bg-blue-900/20' :
      step.status === 'completed' ? 'border-green-800 bg-gray-900' :
      step.status === 'skipped' ? 'border-gray-700 bg-gray-900/50 opacity-60' :
      'border-gray-800 bg-gray-900'
    }`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={isActive ? 'animate-spin' : ''}>{statusIcon}</span>
        <span className="font-medium text-sm">{step.title}</span>
        <span className="ml-auto flex items-center gap-1.5">
          {step.isWriteAction && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/40 text-red-400 font-semibold">WRITE</span>
          )}
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-500" title={`Permission: ${step.requiredPermission}`}>
            {permIcon} {step.tool}
          </span>
          {step.tokens > 0 && (
            <span className="text-xs text-gray-500">{step.tokens} tk</span>
          )}
        </span>
      </div>
      <p className="text-xs text-gray-400 ml-6">{step.description}</p>

      {step.llmOutput && (
        <div className="mt-2 ml-6 bg-gray-800 rounded p-2.5">
          <MarkdownContent text={step.llmOutput} className="text-sm text-gray-200" />
        </div>
      )}

      {step.result && step.status === 'completed' && (
        <div className="mt-2 ml-6 flex gap-2">
          {step.llmOutput && (
            <button onClick={() => setShowWhy(!showWhy)} className="text-xs text-blue-400 hover:text-blue-300">
              {showWhy ? 'Hide data' : 'Show data used'}
            </button>
          )}
          {step.origin && (
            <span className="text-xs text-gray-600">from {step.origin}</span>
          )}
        </div>
      )}

      {showWhy && step.result && (
        <div className="mt-2 ml-6 bg-gray-800/50 border border-gray-700 rounded p-2.5 text-xs text-gray-300 max-h-40 overflow-y-auto">
          <strong>Raw data:</strong>
          <pre className="mt-1 whitespace-pre-wrap break-all">{JSON.stringify(step.result, null, 2).slice(0, 1000)}</pre>
        </div>
      )}
    </div>
  );
}
