import type { OperationKind, OperationView } from '@kiditem/shared/operation';
import type { BrowserResources } from './browser';
import type { OperationClient } from './operation-client';
import type { SiteCaller } from './site-caller';

/**
 * 실행 하나를 끝까지 돌리는 순서(core가 소유, 수집기는 모른다):
 * begin → lockKeys로 브라우저 자원 확보 → collector.collect(plan, site)의 청크를 순서대로 putChunk
 * → finish(succeeded, window·result) / 거절·오류면 `stopFor` 규칙대로 → 자원 해제(항상).
 * 취소는 `AbortSignal`로 들어오고, 서버 cancel은 입구가 따로 부른다.
 */
export interface RunInput {
  kind: OperationKind;
  scope: Record<string, unknown>;
  idempotencyKey?: string;
  signal: AbortSignal;
}

export type RunOutcome =
  | { kind: 'finished'; operation: OperationView }
  | { kind: 'already_running'; existing: Record<string, unknown> | null }
  | { kind: 'fence_lost'; operationId: string; reason: string | null }
  | { kind: 'failed'; operationId: string | null; errorCode: string; errorMessage: string };

export interface RunnerDeps {
  client: OperationClient;
  browser: BrowserResources;
  /** kind → 그 kind가 쓰는 사이트 호출기(없으면 null — 더미 kind). */
  siteFor(kind: OperationKind, lease: { tabId: number | null }): SiteCaller | null;
}

export interface OperationRunner {
  run(input: RunInput): Promise<RunOutcome>;
}
