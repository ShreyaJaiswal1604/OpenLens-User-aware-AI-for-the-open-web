import type { AgentEvent, SessionState, DataEntry, AuditEvent, Insight } from './types';
import { estimateTokens } from '../lib/tokenizer';
import { classifySensitivity } from '../lib/sensitivity';

type Listener = (state: SessionState) => void;

let state: SessionState = createFreshSession();
const listeners: Set<Listener> = new Set();

function createFreshSession(): SessionState {
  return {
    sessionId: `sess_${Date.now()}`,
    startTime: Date.now(),
    totalTokens: 0,
    contextUsed: 0,
    contextLimit: 8192,
    selectedModel: '',
    processingLocation: 'idle',
    dataEntries: [],
    auditEvents: [],
    insights: [],
  };
}

export function getState(): SessionState {
  return state;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  listeners.forEach((l) => l({ ...state }));
}

export function setModel(model: string, contextLimit: number) {
  state.selectedModel = model;
  state.contextLimit = contextLimit;
  notify();
}

export function addDataEntry(entry: Omit<DataEntry, 'id' | 'timestamp'>) {
  const full: DataEntry = {
    ...entry,
    id: `de_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
  };
  state.dataEntries.push(full);
  state.totalTokens += entry.tokenCount;
  state.contextUsed += entry.tokenCount;
  notify();
}

export function addAuditEvent(event: Omit<AuditEvent, 'id' | 'timestamp'>) {
  const full: AuditEvent = {
    ...event,
    id: `ae_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
  };
  state.auditEvents.push(full);
  notify();
}

export function addInsight(insight: Insight) {
  state.insights.push(insight);
  notify();
}

export function setProcessingLocation(loc: SessionState['processingLocation']) {
  state.processingLocation = loc;
  notify();
}

export function emitEvent(event: AgentEvent) {
  // Track data entry
  if (event.tokens && event.tokens > 0) {
    addDataEntry({
      origin: event.origin,
      originType: event.data.originType as DataEntry['originType'] || 'local',
      dataType: event.data.dataType as string || event.type,
      tokenCount: event.tokens,
      sensitivity: classifySensitivity(JSON.stringify(event.data)),
      entryMethod: event.type,
    });
  }

  // Always log to audit
  addAuditEvent({
    type: event.type,
    origin: event.origin,
    detail: event.data,
    tokensInvolved: event.tokens,
    processingLocation: state.processingLocation === 'idle' ? 'local' : state.processingLocation,
  });
}

export function clearSession() {
  state = createFreshSession();
  notify();
}

export function clearOrigin(origin: string) {
  const removedTokens = state.dataEntries
    .filter((e) => e.origin === origin)
    .reduce((sum, e) => sum + e.tokenCount, 0);
  state.dataEntries = state.dataEntries.filter((e) => e.origin !== origin);
  state.totalTokens -= removedTokens;
  state.contextUsed -= removedTokens;
  notify();
}
