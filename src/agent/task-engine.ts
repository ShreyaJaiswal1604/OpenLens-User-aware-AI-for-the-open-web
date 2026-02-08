// Task types shared between background and sidepanel
// Note: actual execution happens in the background service worker

export interface TaskStep {
  id: number;
  title: string;
  description: string;
  tool: string;
  toolParams?: Record<string, string>;
  requiredPermission: string;
  status: 'pending' | 'running' | 'awaiting_approval' | 'completed' | 'skipped';
  result?: unknown;
  llmOutput?: string;
  crossOriginWarning?: string;
  isWriteAction: boolean;
  tokens: number;
  origin?: string;
  sensitivity?: string;
}

export interface TaskPlan {
  intent: string;
  steps: TaskStep[];
  status: 'planning' | 'running' | 'paused' | 'completed' | 'cancelled';
  pageContext?: { title: string; url: string; pageType: string; tokenEstimate: number };
}
