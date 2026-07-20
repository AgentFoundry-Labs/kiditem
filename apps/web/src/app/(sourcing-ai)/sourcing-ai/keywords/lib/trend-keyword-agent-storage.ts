import { safeStorageGet, safeStorageSet } from '@/lib/browser-storage';
import type { TrendKeywordAgentResult } from './trend-keyword-agent';

const TREND_KEYWORD_AGENT_STORAGE_KEY = 'kiditem:sourcing-ai:keyword-analysis:trend-keyword-agent:v1';
export const TREND_KEYWORD_AGENT_UPDATED_EVENT = 'kiditem:sourcing-ai:trend-keyword-agent-updated';

export function readTrendKeywordAgentResult(): TrendKeywordAgentResult | null {
  try {
    const raw = safeStorageGet('local', TREND_KEYWORD_AGENT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return isTrendKeywordAgentResult(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeTrendKeywordAgentResult(result: TrendKeywordAgentResult) {
  if (typeof window === 'undefined') return;
  safeStorageSet('local', TREND_KEYWORD_AGENT_STORAGE_KEY, JSON.stringify(result));
  window.dispatchEvent(new Event(TREND_KEYWORD_AGENT_UPDATED_EVENT));
}

function isTrendKeywordAgentResult(value: unknown): value is TrendKeywordAgentResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<TrendKeywordAgentResult>;
  return typeof result.generatedAt === 'string' && Array.isArray(result.candidates);
}
