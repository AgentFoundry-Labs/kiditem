import type { OperationKind } from '@kiditem/shared/operation';
import type { Collector } from './collector';

/**
 * 등록된 수집기. plan·site 모양은 kind마다 다르다 — runner는 모양을 모르고 그대로 넘긴다.
 */
export type AnyCollector = Collector<never, Record<string, unknown>, never>;

/** kind → 수집기. 등록은 여기 한 곳, 순서는 kind 문자열 사전순. */
const collectors = new Map<OperationKind, AnyCollector>();

export function registerCollector(collector: AnyCollector): void {
  if (collectors.has(collector.kind)) throw new Error(`duplicate collector: ${collector.kind}`);
  collectors.set(collector.kind, collector);
}

export function collectorFor(kind: OperationKind): AnyCollector | null {
  return collectors.get(kind) ?? null;
}

export function registeredKinds(): OperationKind[] {
  return [...collectors.keys()].sort();
}
