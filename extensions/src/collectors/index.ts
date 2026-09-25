import type { OperationKind } from '@kiditem/shared/operation';
import type { Collector } from './collector';

/** kind → 수집기. 등록은 여기 한 곳, 순서는 kind 문자열 사전순. */
const collectors = new Map<OperationKind, Collector>();

export function registerCollector(collector: Collector): void {
  if (collectors.has(collector.kind)) throw new Error(`duplicate collector: ${collector.kind}`);
  collectors.set(collector.kind, collector);
}

export function collectorFor(kind: OperationKind): Collector | null {
  return collectors.get(kind) ?? null;
}

export function registeredKinds(): OperationKind[] {
  return [...collectors.keys()].sort();
}
