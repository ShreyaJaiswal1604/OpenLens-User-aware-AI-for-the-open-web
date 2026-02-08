export type EventType =
  | 'page_load' | 'mcp_discovered' | 'permission_granted'
  | 'permission_denied' | 'tool_call' | 'llm_prompt'
  | 'context_updated' | 'navigation' | 'task_started'
  | 'task_step' | 'task_completed'
  | 'permission_requested' | 'page_read' | 'page_action'
  | 'tool_call_start' | 'tool_call_result';

export type Severity = 'info' | 'warning' | 'critical';

export type PermissionScope = 'page' | 'site' | 'session';
export type PermissionType = 'page_read' | 'data_send' | 'page_action';

export interface Permission {
  type: PermissionType;
  scope: PermissionScope;
  origin: string;
  tabId: number;
  grantedAt: number;
  expiresAt: number | null;
}

export interface AgentEvent {
  type: EventType;
  origin: string;
  data: Record<string, unknown>;
  timestamp: number;
  tokens?: number;
}

export interface Insight {
  moduleId: string;
  severity: Severity;
  summary: string;
  detail: string;
  llmExplanation?: string;
  origin: string;
  timestamp: number;
}

export interface PillStatus {
  icon: string;
  label: string;
  color: 'green' | 'yellow' | 'red' | 'gray';
}

export interface DataEntry {
  id: string;
  origin: string;
  originType: 'site_mcp' | 'user_mcp' | 'local' | 'browser' | 'page_content';
  dataType: string;
  tokenCount: number;
  sensitivity: 'low' | 'medium' | 'high';
  timestamp: number;
  entryMethod: string;
}

export interface AuditEvent {
  id: string;
  timestamp: number;
  type: string;
  origin: string;
  detail: Record<string, unknown>;
  userAction?: 'approved' | 'denied' | 'edited' | 'skipped';
  tokensInvolved?: number;
  processingLocation: 'local' | 'cloud';
}

export interface McpServer {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  status: 'connected' | 'disconnected' | 'error';
  tools: McpTool[];
  lastConnected?: number;
  error?: string;
}

export interface McpTool {
  name: string;
  description: string;
  serverId: string;
  serverName: string;
  inputSchema: {
    type: string;
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

export interface ToolCallEvent {
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
  iteration: number;
  timestamp: number;
}

export interface SessionState {
  sessionId: string;
  startTime: number;
  totalTokens: number;
  contextUsed: number;
  contextLimit: number;
  selectedModel: string;
  processingLocation: 'local' | 'cloud' | 'mixed' | 'idle';
  dataEntries: DataEntry[];
  auditEvents: AuditEvent[];
  insights: Insight[];
}
