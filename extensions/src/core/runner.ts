import {
  OPERATION_CANCEL_CODE,
  OPERATION_CHUNK_MAX_BYTES,
  OPERATION_CHUNKS_MAX,
  OPERATION_LEASE_MS,
  type OperationChunkKind,
  type OperationFinishRequest,
  type OperationInProgressDetails,
  type OperationKind,
  type OperationView,
  type OperationWindow,
} from '@kiditem/shared/operation';
import type { BrowserLease, BrowserResources } from './browser';
import { RuntimeError, isRuntimeError } from './errors';
import { stopFor, type OperationClient } from './operation-client';
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
  /** begin이 성공한 직후(브라우저 자원·수집 전에) 한 번. 입구가 웹앱에 바로 답할 때 쓴다. */
  onBegun?(begun: { operationId: string; reused: boolean }): void;
}

export type RunOutcome =
  | { kind: 'finished'; operation: OperationView }
  | { kind: 'already_running'; existing: OperationInProgressDetails | null }
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

export const RUNTIME_UNKNOWN_KIND = 'RUNTIME_UNKNOWN_KIND' as const;
export const RUNTIME_COLLECT_FAILED = 'RUNTIME_COLLECT_FAILED' as const;
export const RUNTIME_CHUNK_TOO_LARGE = 'RUNTIME_CHUNK_TOO_LARGE' as const;
/**
 * heartbeat가 쓰는 청크 칸. 빈 payload라 checksum이 늘 같아 첫 번째만 0항목 청크로 보관되고
 * 이후는 멱등 쓰기로 임대만 연장한다. 수집기는 이 chunkKind를 쓰지 않는다.
 */
export const HEARTBEAT_CHUNK_KIND = 'heartbeat' as const;
/** 마지막 fenced 쓰기 뒤 이만큼 청크가 없으면 heartbeat. 임대(30분)의 1/3. */
export const HEARTBEAT_INTERVAL_MS = OPERATION_LEASE_MS / 3;

/**
 * runner가 보는 수집기 모양. core는 collectors를 import하지 못하므로(`check:extension-runtime-layers`)
 * `collectors/collector.ts`의 `Collector`와 구조가 같은 최소 모양을 여기 둔다.
 */
export interface RunnableChunk {
  chunkKind: OperationChunkKind;
  payload: unknown[];
  progress?: Record<string, unknown>;
}

export interface RunnableCollector {
  readonly site: string | null;
  collect(plan: Record<string, unknown>, site: SiteCaller | null, context: { signal: AbortSignal; tabId: number | null }): AsyncIterable<RunnableChunk>;
  summarize?(input: { chunks: number; items: number }): { window?: OperationWindow; result?: Record<string, unknown> };
}

const encoder = new TextEncoder();

export function createRunner(deps: RunnerDeps, collectorFor: (kind: OperationKind) => RunnableCollector | null): OperationRunner {
  return {
    async run(input) {
      const collector = collectorFor(input.kind);
      if (!collector) {
        return { kind: 'failed', operationId: null, errorCode: RUNTIME_UNKNOWN_KIND, errorMessage: `이 확장이 모르는 실행 종류입니다: ${input.kind}` };
      }

      let begun;
      try {
        begun = await deps.client.begin({
          kind: input.kind,
          scope: input.scope,
          ...(input.idempotencyKey !== undefined ? { idempotencyKey: input.idempotencyKey } : {}),
        });
      } catch (caught) {
        const error = toRuntimeError(caught, RUNTIME_COLLECT_FAILED);
        const stop = stopFor(error.code, error.details);
        if (stop.kind === 'already_running') return { kind: 'already_running', existing: stop.existing };
        return { kind: 'failed', operationId: null, errorCode: error.code, errorMessage: error.message };
      }
      input.onBegun?.({ operationId: begun.operation.id, reused: begun.reused });
      return execute(deps, collector, input, begun.operation, begun.token);
    },
  };
}

async function execute(
  deps: RunnerDeps,
  collector: RunnableCollector,
  input: RunInput,
  operation: OperationView,
  token: string,
): Promise<RunOutcome> {
  const operationId = operation.id;
  const local = new AbortController();
  const onAbort = () => local.abort(input.signal.reason);
  if (input.signal.aborted) local.abort(input.signal.reason);
  else input.signal.addEventListener('abort', onAbort, { once: true });

  // fenced 쓰기(청크·heartbeat)는 한 줄로 보낸다 — heartbeat가 청크 쓰기와 겹치지 않게.
  let writes: Promise<unknown> = Promise.resolve();
  const write = <T>(send: () => Promise<T>): Promise<T> => {
    const next = writes.then(send);
    writes = next.catch(() => undefined);
    return next;
  };

  let lastProgress: Record<string, unknown> | undefined;
  let heartbeatStop: RuntimeError | null = null;
  let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  const stopHeartbeat = () => {
    if (heartbeatTimer !== null) clearTimeout(heartbeatTimer);
    heartbeatTimer = null;
  };
  const scheduleHeartbeat = () => {
    stopHeartbeat();
    if (local.signal.aborted) return;
    heartbeatTimer = setTimeout(() => {
      heartbeatTimer = null;
      write(() =>
        deps.client.putChunk({
          operationId,
          token,
          chunkKind: HEARTBEAT_CHUNK_KIND,
          sequence: 1,
          payload: [],
          ...(lastProgress ? { progress: lastProgress } : {}),
        }),
      ).then(
        () => scheduleHeartbeat(),
        (caught: unknown) => {
          const error = toRuntimeError(caught, RUNTIME_COLLECT_FAILED);
          // 토큰이 죽었으면 멈춘다. 일시 오류(연결 끊김 등)는 다음 주기에 다시 연장한다.
          if (stopFor(error.code, error.details).kind === 'fence_lost') {
            heartbeatStop = error;
            local.abort(error);
          } else {
            scheduleHeartbeat();
          }
        },
      );
    }, HEARTBEAT_INTERVAL_MS);
  };

  let lease: BrowserLease | null = null;
  try {
    lease = await deps.browser.acquire({ operationId, lockKeys: operation.lockKeys, signal: local.signal });
    const site = deps.siteFor(operation.kind, lease);
    const sequences = new Map<string, number>();
    let chunks = 0;
    let items = 0;
    scheduleHeartbeat();
    for await (const chunk of collector.collect(operation.plan ?? {}, site, { signal: local.signal, tabId: lease.tabId })) {
      if (local.signal.aborted) break;
      assertChunkFits(chunk, chunks);
      const sequence = (sequences.get(chunk.chunkKind) ?? 0) + 1;
      sequences.set(chunk.chunkKind, sequence);
      await write(() =>
        deps.client.putChunk({
          operationId,
          token,
          chunkKind: chunk.chunkKind,
          sequence,
          payload: chunk.payload,
          ...(chunk.progress ? { progress: chunk.progress } : {}),
        }),
      );
      chunks += 1;
      items += chunk.payload.length;
      if (chunk.progress) lastProgress = chunk.progress;
      scheduleHeartbeat();
    }
    stopHeartbeat();
    if (heartbeatStop) throw heartbeatStop;
    if (input.signal.aborted) return cancelled(operationId);

    const summary = collector.summarize?.({ chunks, items }) ?? {};
    const request: OperationFinishRequest = {
      outcome: 'succeeded',
      ...(summary.result ? { result: summary.result } : {}),
      ...(summary.window ? { window: summary.window } : {}),
    };
    const finished = await deps.client.finish({ operationId, token, request });
    return { kind: 'finished', operation: finished.operation };
  } catch (caught) {
    stopHeartbeat();
    if (!heartbeatStop && input.signal.aborted) return cancelled(operationId);
    const error = heartbeatStop ?? toRuntimeError(caught, RUNTIME_COLLECT_FAILED);
    const stop = stopFor(error.code, error.details);
    if (stop.kind === 'fence_lost') return { kind: 'fence_lost', operationId, reason: stop.reason };
    await deps.client
      .finish({ operationId, token, request: { outcome: 'failed', errorCode: error.code.slice(0, 64), errorMessage: error.message.slice(0, 2_000) } })
      .catch(() => undefined);
    return { kind: 'failed', operationId, errorCode: error.code, errorMessage: error.message };
  } finally {
    stopHeartbeat();
    local.abort();
    input.signal.removeEventListener('abort', onAbort);
    await lease?.release().catch(() => undefined);
  }
}

/** 서버 cancel은 입구가 이미 불렀다 — finish를 보내지 않는다. */
function cancelled(operationId: string): RunOutcome {
  return { kind: 'failed', operationId, errorCode: OPERATION_CANCEL_CODE, errorMessage: '실행을 중단했습니다.' };
}

function assertChunkFits(chunk: RunnableChunk, sentChunks: number): void {
  const bytes = encoder.encode(JSON.stringify(chunk.payload)).byteLength;
  if (bytes > OPERATION_CHUNK_MAX_BYTES) {
    throw new RuntimeError(RUNTIME_CHUNK_TOO_LARGE, `청크 하나가 ${OPERATION_CHUNK_MAX_BYTES}바이트를 넘습니다.`, { chunkKind: chunk.chunkKind, bytes });
  }
  // heartbeat 칸 하나를 남긴다.
  if (sentChunks + 1 >= OPERATION_CHUNKS_MAX) {
    throw new RuntimeError(RUNTIME_CHUNK_TOO_LARGE, `청크가 ${OPERATION_CHUNKS_MAX}개를 넘습니다.`, { chunkKind: chunk.chunkKind, reason: 'too_many_chunks' });
  }
}

function toRuntimeError(caught: unknown, fallbackCode: string): RuntimeError {
  if (isRuntimeError(caught)) return caught;
  const message = caught instanceof Error && caught.message ? caught.message : '실행 중 오류가 났습니다.';
  return new RuntimeError(fallbackCode, message, null, caught);
}
