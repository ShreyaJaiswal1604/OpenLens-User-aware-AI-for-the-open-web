// Unified LLM provider interface — works with Ollama, OpenAI, Anthropic, OpenRouter
// All use fetch() from the service worker, no external dependencies

export type ProviderType = 'ollama' | 'openai' | 'anthropic' | 'openrouter';

export interface LLMConfig {
  provider: ProviderType;
  model: string;
  apiKey?: string;         // required for cloud providers
  ollamaEndpoint?: string; // defaults to http://localhost:11434
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  content: string;
  tokensUsed?: number;
  processingLocation: 'local' | 'cloud';
}

// Provider metadata for UI
export const PROVIDERS: Record<ProviderType, { name: string; icon: string; isLocal: boolean; modelsUrl?: string; defaultModels: string[] }> = {
  ollama: {
    name: 'Ollama (Local)',
    icon: '\u{1F7E2}',
    isLocal: true,
    defaultModels: [], // populated dynamically
  },
  openai: {
    name: 'OpenAI',
    icon: '\u{1F4AC}',
    isLocal: false,
    modelsUrl: 'https://api.openai.com/v1/models',
    defaultModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1-nano'],
  },
  anthropic: {
    name: 'Anthropic',
    icon: '\u{1F9E0}',
    isLocal: false,
    defaultModels: ['claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001'],
  },
  openrouter: {
    name: 'OpenRouter',
    icon: '\u{1F310}',
    isLocal: false,
    modelsUrl: 'https://openrouter.ai/api/v1/models',
    defaultModels: ['meta-llama/llama-3.1-8b-instruct:free', 'mistralai/mistral-7b-instruct:free', 'google/gemma-2-9b-it:free'],
  },
};

export function isLocalProvider(provider: ProviderType): boolean {
  return PROVIDERS[provider].isLocal;
}

// ---- Ollama ----

async function ollamaChat(config: LLMConfig, messages: ChatMessage[]): Promise<ChatResponse> {
  const base = config.ollamaEndpoint || 'http://localhost:11434';
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.model, messages, stream: false }),
  });
  if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
  const data = await res.json();
  return {
    content: data.message?.content || '',
    tokensUsed: data.eval_count,
    processingLocation: 'local',
  };
}

// ---- OpenAI-compatible (OpenAI + OpenRouter) ----

async function openaiCompatChat(
  baseUrl: string,
  config: LLMConfig,
  messages: ChatMessage[],
  extraHeaders?: Record<string, string>
): Promise<ChatResponse> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
      ...extraHeaders,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      max_tokens: 1024,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return {
    content: data.choices?.[0]?.message?.content || '',
    tokensUsed: data.usage?.total_tokens,
    processingLocation: 'cloud',
  };
}

// ---- Anthropic ----

async function anthropicChat(config: LLMConfig, messages: ChatMessage[]): Promise<ChatResponse> {
  // Separate system message from user/assistant messages
  const systemMsg = messages.find((m) => m.role === 'system')?.content || '';
  const chatMessages = messages.filter((m) => m.role !== 'system');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey!,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 1024,
      system: systemMsg,
      messages: chatMessages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return {
    content: data.content?.[0]?.text || '',
    tokensUsed: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    processingLocation: 'cloud',
  };
}

// ---- Unified chat function ----

export async function chat(config: LLMConfig, messages: ChatMessage[]): Promise<ChatResponse> {
  switch (config.provider) {
    case 'ollama':
      return ollamaChat(config, messages);

    case 'openai':
      return openaiCompatChat('https://api.openai.com/v1', config, messages);

    case 'anthropic':
      return anthropicChat(config, messages);

    case 'openrouter':
      return openaiCompatChat('https://openrouter.ai/api/v1', config, messages, {
        'HTTP-Referer': 'https://openlens.dev',
        'X-Title': 'OpenLens',
      });

    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}

// ---- Provider health checks ----

export async function checkOllama(endpoint?: string): Promise<boolean> {
  try {
    const base = endpoint || 'http://localhost:11434';
    const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function listOllamaModels(endpoint?: string): Promise<Array<{ name: string; size: number; details: any }>> {
  const base = endpoint || 'http://localhost:11434';
  const res = await fetch(`${base}/api/tags`);
  const data = await res.json();
  return data.models || [];
}

export async function checkApiKey(config: LLMConfig): Promise<boolean> {
  try {
    // Send a minimal request to verify the key works
    const response = await chat(config, [
      { role: 'user', content: 'Say "ok" and nothing else.' },
    ]);
    return response.content.length > 0;
  } catch {
    return false;
  }
}
