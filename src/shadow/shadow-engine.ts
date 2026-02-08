import { chat } from '../lib/ollama';
import type { AuditEvent } from '../modules/types';

export interface ShadowInference {
  inference: string;
  confidence: 'high' | 'medium' | 'low';
  derivedFrom: string[];
  category: 'financial' | 'schedule' | 'preferences' | 'relationships' | 'habits' | 'work' | 'location' | 'health';
  icon: string;
  timestamp: number;
  sessionId: string;
}

export interface ShadowProfile {
  inferences: ShadowInference[];
  firstSeen: number;
  lastUpdated: number;
  sessionCount: number;
}

const CATEGORY_ICONS: Record<string, string> = {
  financial: '\u{1F4B0}',
  schedule: '\u{1F4C5}',
  preferences: '\u{1F3A7}',
  relationships: '\u{1F464}',
  habits: '\u{1F4DD}',
  work: '\u{1F3E2}',
  location: '\u{1F4CD}',
  health: '\u{2764}\u{FE0F}',
};

export async function generateShadowProfile(
  model: string,
  events: AuditEvent[],
  sessionId: string
): Promise<ShadowInference[]> {
  const toolCalls = events.filter((e) => e.type === 'tool_call');
  const llmPrompts = events.filter((e) => e.type === 'llm_prompt');
  const steps = events.filter((e) => e.type === 'task_step');

  const prompt = `Given the following AI session activity, list personal attributes, preferences, habits, or behaviors that can be INFERRED about the user — not just what was explicitly provided.

For each inference, output a JSON object with:
- "inference": specific inference (string)
- "confidence": "high", "medium", or "low"
- "derivedFrom": array of strings explaining what data led to this
- "category": one of "financial", "schedule", "preferences", "relationships", "habits", "work"

Be thorough. Include non-obvious inferences. Output ONLY a JSON array, no other text.

Session activity:
Tool calls: ${JSON.stringify(toolCalls.map((e) => ({ type: e.type, origin: e.origin, detail: e.detail })))}
LLM prompts: ${JSON.stringify(llmPrompts.map((e) => ({ origin: e.origin, detail: e.detail })))}
Task steps: ${JSON.stringify(steps.map((e) => ({ origin: e.origin, detail: e.detail })))}`;

  try {
    const response = await chat(model, [
      {
        role: 'system',
        content: 'You are analyzing what an AI system can INFER about a user from their browsing activity. Output ONLY a valid JSON array.',
      },
      { role: 'user', content: prompt },
    ]);

    const content = response.message.content.trim();
    // Extract JSON array from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return getFallbackInferences(sessionId);

    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.map((item: any) => ({
      inference: item.inference || '',
      confidence: item.confidence || 'medium',
      derivedFrom: item.derivedFrom || [],
      category: item.category || 'preferences',
      icon: CATEGORY_ICONS[item.category] || '\u{1F50D}',
      timestamp: Date.now(),
      sessionId,
    }));
  } catch {
    return getFallbackInferences(sessionId);
  }
}

// Fallback inferences when LLM is unavailable — based on the demo data
function getFallbackInferences(sessionId: string): ShadowInference[] {
  const now = Date.now();
  return [
    {
      inference: 'Budget around $200 for electronics',
      confidence: 'high',
      derivedFrom: ['Product search with max price $200 filter'],
      category: 'financial',
      icon: '\u{1F4B0}',
      timestamp: now,
      sessionId,
    },
    {
      inference: 'Interested in noise-cancelling headphones',
      confidence: 'high',
      derivedFrom: ['Searched specifically for noise-cancelling headphones'],
      category: 'preferences',
      icon: '\u{1F3A7}',
      timestamp: now,
      sessionId,
    },
    {
      inference: 'Free Thursday afternoons',
      confidence: 'high',
      derivedFrom: ['Calendar showed no events after 2 PM on Thursday'],
      category: 'schedule',
      icon: '\u{1F4C5}',
      timestamp: now,
      sessionId,
    },
    {
      inference: 'Has regular morning work meetings',
      confidence: 'medium',
      derivedFrom: ['Calendar entries: standup at 9 AM, 1:1 at 11 AM'],
      category: 'work',
      icon: '\u{1F3E2}',
      timestamp: now,
      sessionId,
    },
    {
      inference: 'Has a manager',
      confidence: 'medium',
      derivedFrom: ['"1:1 with manager" calendar entry'],
      category: 'work',
      icon: '\u{1F3E2}',
      timestamp: now,
      sessionId,
    },
    {
      inference: 'Researches before buying',
      confidence: 'high',
      derivedFrom: ['Compared multiple products, checked specs and ratings'],
      category: 'habits',
      icon: '\u{1F4DD}',
      timestamp: now,
      sessionId,
    },
    {
      inference: 'Uses notes app to save research',
      confidence: 'high',
      derivedFrom: ['Final step was "save to notes"'],
      category: 'habits',
      icon: '\u{1F4DD}',
      timestamp: now,
      sessionId,
    },
    {
      inference: 'Values audio quality',
      confidence: 'medium',
      derivedFrom: ['Browsed premium headphone brands (Sony, Bose, Sennheiser)'],
      category: 'preferences',
      icon: '\u{1F3A7}',
      timestamp: now,
      sessionId,
    },
  ];
}

export function createEmptyProfile(): ShadowProfile {
  return {
    inferences: [],
    firstSeen: Date.now(),
    lastUpdated: Date.now(),
    sessionCount: 0,
  };
}

export function groupByCategory(inferences: ShadowInference[]): Record<string, ShadowInference[]> {
  const groups: Record<string, ShadowInference[]> = {};
  for (const inf of inferences) {
    if (!groups[inf.category]) groups[inf.category] = [];
    groups[inf.category].push(inf);
  }
  return groups;
}
