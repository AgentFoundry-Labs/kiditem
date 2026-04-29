import type { AdapterModule } from './types';
import { claudeLocalAdapter } from './claude-local/execute';
import { pythonHttpAdapter } from './python-http/execute';

/**
 * Adapter Registry — type → 구현체 매핑.
 * 새 adapter 추가: 구현 후 여기에 등록.
 */
const adaptersByType = new Map<string, AdapterModule>([
  [claudeLocalAdapter.type, claudeLocalAdapter],
  [pythonHttpAdapter.type, pythonHttpAdapter],
]);

export function getAdapter(type: string): AdapterModule {
  const adapter = adaptersByType.get(type);
  if (!adapter) {
    throw new Error(`Unknown adapter type: ${type}. Available: ${[...adaptersByType.keys()].join(', ')}`);
  }
  return adapter;
}

export function getFallbackChain(agentType: string, fallbackChain?: string[]): string[] {
  if (fallbackChain?.length) return fallbackChain;
  return ['claude_local']; // Default: single adapter, no fallback
}
