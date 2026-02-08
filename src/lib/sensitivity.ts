export type Sensitivity = 'low' | 'medium' | 'high';

const HIGH_PATTERNS = /calendar|schedule|event|meeting|email|draft|order|payment|price|budget|name|address|phone|birth|health|medical|password|credit|bank|salary/i;
const MEDIUM_PATTERNS = /preference|search|query|pattern|browse|history|bookmark|wishlist|cart|interest/i;

export function classifySensitivity(text: string): Sensitivity {
  if (HIGH_PATTERNS.test(text)) return 'high';
  if (MEDIUM_PATTERNS.test(text)) return 'medium';
  return 'low';
}

export function sensitivityColor(s: Sensitivity): string {
  switch (s) {
    case 'high': return '#ef4444';
    case 'medium': return '#f59e0b';
    case 'low': return '#22c55e';
  }
}
