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
import { OperationNextSchema, type OperationNext } from '@kiditem/shared/operation';
import type { BrowserLease, BrowserResources } from './browser';
import { RuntimeError, isRuntimeError } from './errors';
import { stopFor, type OperationClient } from './operation-client';
import { SITE_LOGIN_REQUIRED } from './site-caller';

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
  /**
   * 사이트 로그인에 쓸 저장 자격(KID-377). 이 실행(과 연쇄로 이어진 실행)의 사이트 lease로만 넘긴다 — begin·청크·progress·
   * finish·outcome에는 싣지 않는다.
   */
  credentials?: RunCredentials;
  /** 웹이 그 몰의 자동 로그인 차단 때문에 자격을 싣지 않았다 — `no_credentials` 대신 `blocked`로 적는다(실기기 R7). */
  loginBlocked?: boolean;
  signal: AbortSignal;
  /**
   * 새 실행의 begin이 성공한 직후(브라우저 자원·수집 전에). reused면 부르지 않는다. 입구가 웹앱에 바로 답할 때 쓴다.
   * 연쇄로 이어진 실행마다 한 번씩 불린다(입구가 취소 대상을 알도록).
   */
  onBegun?(begun: { operationId: string; reused: boolean }): void;
}

/** `sites/registry`의 `SiteCredentials`와 같은 모양(core는 sites를 import하지 않는다). */
export interface RunCredentials {
  loginId: string;
  password: string;
  supplierLoginId?: string | null;
}

/** 사이트 핸들을 만들 때 넘기는 것: 브라우저 자원이 잡은 탭과 이 실행의 자격. */
export interface RunSiteLease {
  tabId: number | null;
  credentials?: RunCredentials | null;
}

export type RunOutcome =
  | { kind: 'finished'; operation: OperationView }
  /** `reused`: 409가 아니라 begin이 같은 idempotencyKey의 살아 있는 실행을 돌려줬다. */
  | { kind: 'already_running'; existing: OperationInProgressDetails | null; reused?: true; message?: string }
  | { kind: 'fence_lost'; operationId: string; reason: string | null }
  /** `details`: 거절·오류의 구조 데이터(예 begin의 `{reason: 'unknown_operation_kind'}`, 상한의 `{reason: 'too_many_chunks'}`). */
  | { kind: 'failed'; operationId: string | null; errorCode: string; errorMessage: string; details?: Record<string, unknown> };

export interface RunnerDeps {
  client: OperationClient;
  browser: BrowserResources;
  /**
   * kind → 그 kind의 수집기에 넘길 사이트 핸들(없으면 null — 더미 kind). 사이트마다 모양이 달라(`sites/<site>`의 API)
   * core는 모양을 모른다 — 입구가 사이트를 조립하고 수집기가 자기에게 필요한 모양을 선언한다(KID-354).
   */
  siteFor(kind: OperationKind, lease: RunSiteLease): unknown;
}

/** 서버가 준비해 둔 실행(`prepared`)을 받아 돌리는 입력(KID-386). 자격은 싣지 않는다 — 로그인이 필요하면 운영자가 한다. */
export interface RunClaimedInput {
  kinds: OperationKind[];
  /** 로그·진단용(서버 claim의 `workerId`). */
  workerId: string;
  signal: AbortSignal;
  onBegun?(begun: { operationId: string; reused: boolean }): void;
}

export interface OperationRunner {
  run(input: RunInput): Promise<RunOutcome>;
  /**
   * claim → 받은 실행의 plan·lockKeys·토큰으로 begin 경로와 같은 순서(자원 → 청크 → finish, `stopFor` 중지 규칙).
   * 후보가 없으면 null. 연쇄(`result.next`)는 잇지 않는다 — 준비한 실행의 다음은 서버가 정한다.
   */
  runClaimed(input: RunClaimedInput): Promise<RunOutcome | null>;
}

export const RUNTIME_UNKNOWN_KIND = 'RUNTIME_UNKNOWN_KIND' as const;
export const RUNTIME_COLLECT_FAILED = 'RUNTIME_COLLECT_FAILED' as const;
export const RUNTIME_CHUNK_TOO_LARGE = 'RUNTIME_CHUNK_TOO_LARGE' as const;
/**
 * heartbeat가 쓰는 청크 칸. payload가 비어 있어 서버가 보관하지 않고 임대 연장·progress 갱신만 한다
 * (`extend_only`) — finalize는 이 쓰기를 보지 못한다. 수집기는 이 chunkKind를 쓰지 않는다.
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

export interface RunnableCollectContext {
  signal: AbortSignal;
  tabId: number | null;
  /**
   * 청크 사이에 progress만 곧바로 올린다(예: 사이트가 운영자 검증을 기다리는 동안 `attention`). 빈 payload heartbeat로
   * 보내 임대도 연장되고, 다음 heartbeat도 이 progress를 싣는다.
   */
  report(progress: Record<string, unknown>): Promise<void>;
}

/**
 * 수집기가 청크를 다 낸 뒤 돌려주는 finish 값(생성기 반환값). 실행마다 다른 결과(등록 결과 등)를 싣는다. `outcome`
 * `reconciling`은 몰에 제출했지만 외부 결과를 그 자리에서 읽지 못한 등록 실행이다(KID-364 — 계약은 `result`를 요구한다).
 */
export interface RunnableFinish {
  outcome?: 'succeeded' | 'reconciling';
  window?: OperationWindow;
  result?: Record<string, unknown>;
}

export interface RunnableCollector {
  readonly site: string | null;
  /** 청크 스트림. 생성기가 `RunnableFinish`를 돌려주면 그 값이 `summarize`보다 앞선다. */
  collect(plan: Record<string, unknown>, site: unknown, context: RunnableCollectContext): AsyncIterable<RunnableChunk> | AsyncGenerator<RunnableChunk, RunnableFinish | void, undefined>;
  summarize?(input: { chunks: number; items: number }): { window?: OperationWindow; result?: Record<string, unknown> };
  /**
   * 실패 finish에 실을 result(있으면). 수집기가 오류를 보고 정한다 — 광고 액션의 `not_attempted`처럼 owner가 실패에도 결과
   * 모양을 받는 kind(KID-386). fence_lost·취소는 finish를 보내지 않으므로 부르지 않는다.
   */
  failureResult?(
    plan: Record<string, unknown>,
    error: { code: string; message: string },
    /** 실패 전 마지막 progress(청크·report가 올린 것, 쓰기가 실패했어도) — 수집기가 어디까지 갔는지의 표식. */
    state: { progress: Record<string, unknown> | null },
  ): Record<string, unknown> | null;
}

const encoder = new TextEncoder();

export function createRunner(deps: RunnerDeps, collectorFor: (kind: OperationKind) => RunnableCollector | null): OperationRunner {
  return {
    /**
     * 연쇄(KID-354): 성공한 실행의 `result.next`가 있으면 같은 환경으로 그 kind를 이어서 돌린다(루프, 재귀 아님).
     * 실패·거절·취소는 그 실행의 outcome으로 끝나고, 마지막 실행의 outcome을 돌려준다.
     */
    async run(input) {
      let step: RunInput = input;
      for (;;) {
        const outcome = await runOne(deps, collectorFor, step);
        const next = outcome.kind === 'finished' && outcome.operation.status === 'succeeded'
          ? nextOperationFrom(outcome.operation.result)
          : null;
        if (!next || input.signal.aborted) return outcome;
        // 이어지는 실행은 새 실행이다 — 앞 실행의 idempotencyKey를 물려주지 않는다. 자격은 다음 수집기가 같은 사이트일
        // 때만 넘긴다(한 사이트의 자격이 다른 사이트로 가지 않게, KID-377).
        const { idempotencyKey: _previousKey, credentials, loginBlocked, ...rest } = step;
        const sameSite = (collectorFor(next.kind)?.site ?? null) === (collectorFor(step.kind)?.site ?? null);
        step = {
          ...rest,
          ...(sameSite && credentials !== undefined ? { credentials } : {}),
          ...(sameSite && loginBlocked ? { loginBlocked } : {}),
          kind: next.kind,
          scope: next.scope,
        };
      }
    },

    async runClaimed(input) {
      let claimed;
      try {
        claimed = await deps.client.claim({ kinds: input.kinds, workerId: input.workerId });
      } catch (caught) {
        const error = toRuntimeError(caught, RUNTIME_COLLECT_FAILED);
        return { kind: 'failed', operationId: null, errorCode: error.code, errorMessage: error.message, ...(error.details ? { details: error.details } : {}) };
      }
      const { operation, token } = claimed;
      if (!operation || !token) return null;
      const collector = collectorFor(operation.kind);
      if (!collector) {
        // 받은 실행은 이 확장의 것이다 — 임대 만료까지 붙잡지 않고 바로 실패로 돌려준다.
        const errorMessage = `이 확장이 모르는 실행 종류입니다: ${operation.kind}`;
        await deps.client
          .finish({ operationId: operation.id, token, request: { outcome: 'failed', errorCode: RUNTIME_UNKNOWN_KIND, errorMessage } })
          .catch(() => undefined);
        return { kind: 'failed', operationId: operation.id, errorCode: RUNTIME_UNKNOWN_KIND, errorMessage };
      }
      input.onBegun?.({ operationId: operation.id, reused: false });
      // 준비 실행은 owner가 임대를 정한다(광고 액션 10분) — heartbeat는 받은 임대의 1/3마다.
      const heartbeatMs = claimedHeartbeatInterval(operation.expiresAt, Date.now());
      return execute(deps, collector, { kind: operation.kind, scope: {}, signal: input.signal }, operation, token, heartbeatMs);
    },
  };
}

async function runOne(
  deps: RunnerDeps,
  collectorFor: (kind: OperationKind) => RunnableCollector | null,
  input: RunInput,
): Promise<RunOutcome> {
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
    if (stop.kind === 'already_running') return { kind: 'already_running', existing: stop.existing, message: error.message };
    return { kind: 'failed', operationId: null, errorCode: error.code, errorMessage: error.message, ...(error.details ? { details: error.details } : {}) };
  }
  if (begun.reused) {
    // 살아 있는 같은 실행(같은 idempotencyKey)이다. 누가 돌리는지 모르므로(워커 재시작·다른 브라우저)
    // 1번 청크부터 다시 모으지 않고 cancel도 하지 않는다. 이어 받기(reconcile)는 KID-364.
    const { id: operationId, kind, lockKeys, startedAt, expiresAt } = begun.operation;
    return { kind: 'already_running', existing: { operationId, kind, lockKeys, startedAt, expiresAt }, reused: true };
  }
  input.onBegun?.({ operationId: begun.operation.id, reused: begun.reused });
  return execute(deps, collector, input, begun.operation, begun.token);
}

async function execute(
  deps: RunnerDeps,
  collector: RunnableCollector,
  input: RunInput,
  operation: OperationView,
  token: string,
  heartbeatMs: number = HEARTBEAT_INTERVAL_MS,
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
  let collectionDone = false;
  const scheduleHeartbeat = () => {
    stopHeartbeat();
    if (collectionDone || local.signal.aborted) return;
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
    }, heartbeatMs);
  };

  let lease: BrowserLease | null = null;
  let failure: RuntimeError | null = null;
  try {
    lease = await deps.browser.acquire({ operationId, lockKeys: operation.lockKeys, site: collector.site, signal: local.signal });
    const site = deps.siteFor(operation.kind, { tabId: lease.tabId, ...(input.credentials ? { credentials: input.credentials } : {}) });
    const sequences = new Map<string, number>();
    let chunks = 0;
    let items = 0;
    scheduleHeartbeat();
    const report = async (progress: Record<string, unknown>) => {
      if (collectionDone || local.signal.aborted) return;
      lastProgress = progress;
      await write(() =>
        deps.client.putChunk({ operationId, token, chunkKind: HEARTBEAT_CHUNK_KIND, sequence: 1, payload: [], progress }),
      );
      scheduleHeartbeat();
    };
    // `for await`는 생성기의 반환값을 버린다 — 끝 값(실행마다 다른 result)을 받으려고 직접 넘긴다.
    const stream = collector.collect(operation.plan ?? {}, site, { signal: local.signal, tabId: lease.tabId, report })[Symbol.asyncIterator]();
    let returned: RunnableFinish | void = undefined;
    try {
      for (;;) {
        const step = await stream.next();
        if (step.done) {
          returned = step.value as RunnableFinish | void;
          break;
        }
        const chunk = step.value;
        if (local.signal.aborted) {
          await stream.return?.(undefined);
          break;
        }
        if (chunk.chunkKind === HEARTBEAT_CHUNK_KIND) {
          throw new RuntimeError(RUNTIME_COLLECT_FAILED, `수집기는 예약된 chunkKind(${HEARTBEAT_CHUNK_KIND})를 쓰지 않는다.`, { reason: 'reserved_chunk_kind' });
        }
        // 빈 청크는 서버가 보관하지 않는다(임대 연장·progress만) — 순번을 쓰지 않고 청크 수·상한에도 세지 않는다.
        const empty = chunk.payload.length === 0;
        if (!empty) assertChunkFits(chunk, chunks);
        const next = (sequences.get(chunk.chunkKind) ?? 0) + 1;
        const sequence = empty ? Math.min(next, OPERATION_CHUNKS_MAX) : next;
        if (!empty) sequences.set(chunk.chunkKind, sequence);
        // 쓰기가 실패해도 수집기가 어디까지 갔는지 남긴다(failureResult의 표식).
        if (chunk.progress) lastProgress = chunk.progress;
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
        if (!empty) {
          chunks += 1;
          items += chunk.payload.length;
        }
        if (chunk.progress) lastProgress = chunk.progress;
        scheduleHeartbeat();
      }
    } catch (error) {
      // 청크 쓰기가 실패하면 수집기의 `finally`(탭 정리)가 돌게 닫는다(`for await`가 하던 일).
      await stream.return?.(undefined).catch(() => undefined);
      throw error;
    }
    collectionDone = true;
    stopHeartbeat();
    // 날아가는 heartbeat가 있으면 끝난 뒤에 finish한다(fenced 쓰기가 겹치지 않게).
    await writes;
    if (heartbeatStop) throw heartbeatStop;
    if (input.signal.aborted) return cancelled(operationId);

    const summary: RunnableFinish = (returned && (returned.result || returned.window) ? returned : collector.summarize?.({ chunks, items })) ?? {};
    const request: OperationFinishRequest = {
      outcome: summary.outcome ?? 'succeeded',
      ...(summary.result ? { result: summary.result } : {}),
      ...(summary.window ? { window: summary.window } : {}),
    };
    const finished = await deps.client.finish({ operationId, token, request });
    return { kind: 'finished', operation: finished.operation };
  } catch (caught) {
    collectionDone = true;
    stopHeartbeat();
    if (!heartbeatStop && input.signal.aborted) return cancelled(operationId);
    const error = heartbeatStop ?? toRuntimeError(caught, RUNTIME_COLLECT_FAILED);
    failure = error;
    const stop = stopFor(error.code, error.details);
    if (stop.kind === 'fence_lost') return { kind: 'fence_lost', operationId, reason: stop.reason };
    await writes;
    const login = loginFailureOf(error, input.loginBlocked === true);
    let failureResult: Record<string, unknown> | null = null;
    try {
      failureResult = collector.failureResult?.(operation.plan ?? {}, { code: error.code, message: error.message }, { progress: lastProgress ?? null }) ?? null;
    } catch {
      failureResult = null;
    }
    const result = failureResult || login ? { ...(failureResult ?? {}), ...(login ? { login } : {}) } : null;
    await deps.client
      .finish({
        operationId,
        token,
        request: {
          outcome: 'failed',
          errorCode: error.code.slice(0, 64),
          errorMessage: error.message.slice(0, 2_000),
          ...(result ? { result } : {}),
        },
      })
      .catch(() => undefined);
    return { kind: 'failed', operationId, errorCode: error.code, errorMessage: error.message, ...(error.details ? { details: error.details } : {}) };
  } finally {
    stopHeartbeat();
    local.abort();
    input.signal.removeEventListener('abort', onAbort);
    await lease?.release({ error: failure }).catch(() => undefined);
  }
}

/**
 * 로그인 화면에서 멈춘 실행의 까닭(KID-377). 웹은 실행 표(`GET /api/operations`)만 보므로 failed finish의 `result.login`에
 * 까닭(`reason`)과 몰이 알림 창으로 남긴 말(`mallMessage`)만 싣는다 — 실행 표는 모든 읽는 사람이 보므로 그 밖의 details는
 * 싣지 않는다(자격은 details에도 없다).
 */
function loginFailureOf(error: RuntimeError, loginBlocked: boolean): Record<string, string> | null {
  if (error.code !== SITE_LOGIN_REQUIRED || typeof error.details?.reason !== 'string') return null;
  const mallMessage = error.details.mallMessage;
  // 자격이 없던 까닭이 웹의 차단이면 그렇게 적는다 — 저장 자격이 없는 것과 운영자가 할 일이 다르다(실기기 R7).
  const reason = error.details.reason === 'no_credentials' && loginBlocked ? 'blocked' : error.details.reason;
  return {
    reason: reason.slice(0, 64),
    ...(typeof mallMessage === 'string' && mallMessage ? { mallMessage: mallMessage.slice(0, 300) } : {}),
  };
}

/** 받은 실행의 남은 임대의 1/3(5초 ~ 기본 간격). 만료 시각을 읽지 못하면 기본 간격. */
const MIN_HEARTBEAT_INTERVAL_MS = 5_000;
export function claimedHeartbeatInterval(expiresAt: string | Date, now: number): number {
  const remaining = new Date(expiresAt).getTime() - now;
  if (!Number.isFinite(remaining)) return HEARTBEAT_INTERVAL_MS;
  return Math.min(HEARTBEAT_INTERVAL_MS, Math.max(MIN_HEARTBEAT_INTERVAL_MS, Math.floor(remaining / 3)));
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
  if (sentChunks >= OPERATION_CHUNKS_MAX) {
    throw new RuntimeError(RUNTIME_CHUNK_TOO_LARGE, `청크가 ${OPERATION_CHUNKS_MAX}개를 넘습니다.`, { chunkKind: chunk.chunkKind, reason: 'too_many_chunks' });
  }
}

function toRuntimeError(caught: unknown, fallbackCode: string): RuntimeError {
  if (isRuntimeError(caught)) return caught;
  const message = caught instanceof Error && caught.message ? caught.message : '실행 중 오류가 났습니다.';
  return new RuntimeError(fallbackCode, message, null, caught);
}

/**
 * 연쇄 규칙(KID-354): 성공한 실행의 `result.next`가 `{ kind, scope }` 모양이면 runner가 같은 환경으로 그 kind를
 * 이어서 begin한다. 순수 규칙 — 모양이 아니거나 없으면 null. kind별 특수 처리는 없다.
 */
export function nextOperationFrom(result: Record<string, unknown> | null | undefined): OperationNext | null {
  const next = result?.next;
  if (next === undefined || next === null) return null;
  const parsed = OperationNextSchema.safeParse(next);
  return parsed.success ? parsed.data : null;
}
