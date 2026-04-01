import type { AdapterModule } from './types';
import { claudeLocalAdapter } from './claude-local/execute';

/**
 * Adapter Registry — type → 구현체 매핑.
 * 새 adapter 추가: 구현 후 여기에 등록.
 */
const adaptersByType = new Map<string, AdapterModule>([
  [claudeLocalAdapter.type, claudeLocalAdapter],
]);

export function getAdapter(type: string): AdapterModule {
  const adapter = adaptersByType.get(type);
  if (!adapter) {
    throw new Error(`Unknown adapter type: ${type}. Available: ${[...adaptersByType.keys()].join(', ')}`);
  }
  return adapter;
}

export function listAdapters(): AdapterModule[] {
  return [...adaptersByType.values()];
}
