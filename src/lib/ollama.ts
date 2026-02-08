const OLLAMA_BASE = 'http://localhost:11434';

export interface OllamaModel {
  name: string;
  size: number;
  digest: string;
  details: {
    parameter_size: string;
    quantization_level: string;
    family: string;
  };
}

export interface OllamaModelInfo {
  parameters: string;
  template: string;
  modelfile: string;
  model_info?: Record<string, unknown>;
}

export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaChatResponse {
  message: { role: string; content: string };
  eval_count?: number;
  eval_duration?: number;
  total_duration?: number;
}

export interface OllamaGenerateResponse {
  response: string;
  eval_count?: number;
  eval_duration?: number;
  total_duration?: number;
}

export async function isOllamaRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function listModels(): Promise<OllamaModel[]> {
  const res = await fetch(`${OLLAMA_BASE}/api/tags`);
  const data = await res.json();
  return data.models || [];
}

export async function showModel(name: string): Promise<OllamaModelInfo> {
  const res = await fetch(`${OLLAMA_BASE}/api/show`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return res.json();
}

export async function generate(model: string, prompt: string): Promise<OllamaGenerateResponse> {
  const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, stream: false }),
  });
  return res.json();
}

export async function chat(model: string, messages: OllamaChatMessage[]): Promise<OllamaChatResponse> {
  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: false }),
  });
  return res.json();
}

export async function getRunningModels(): Promise<{ models: Array<{ name: string; size_vram: number }> }> {
  const res = await fetch(`${OLLAMA_BASE}/api/ps`);
  return res.json();
}

export function getContextLength(modelInfo: OllamaModelInfo): number {
  const info = modelInfo.model_info as Record<string, unknown> | undefined;
  if (info) {
    for (const [key, value] of Object.entries(info)) {
      if (key.includes('context_length') && typeof value === 'number') return value;
    }
  }
  return 8192; // default
}
