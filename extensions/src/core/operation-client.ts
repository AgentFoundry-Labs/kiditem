import type {
  OperationBeginRequest,
  OperationBeginResponse,
  OperationChunkKind,
  OperationChunkPutResponse,
  OperationFinishRequest,
  OperationFinishResponse,
  OperationView,
} from '@kiditem/shared/operation';

/**
 * 서버 실행 계약(ADR-0025)의 유일한 창구. begin·chunk·finish·cancel 넷뿐이고,
 * fenced 쓰기(chunk·finish)는 begin 응답의 토큰을 `x-operation-token`으로 보낸다.
 * 수집기는 이 포트를 직접 부르지 못한다(`check:extension-runtime-layers`) — runner가 대신 부른다.
 */
export interface OperationClient {
  begin(request: OperationBeginRequest): Promise<OperationBeginResponse>;
  putChunk(input: {
    operationId: string;
    token: string;
    chunkKind: OperationChunkKind;
    sequence: number;
    payload: unknown[];
    progress?: Record<string, unknown>;
  }): Promise<OperationChunkPutResponse>;
  finish(input: { operationId: string; token: string; request: OperationFinishRequest }): Promise<OperationFinishResponse>;
  cancel(operationId: string): Promise<OperationView>;
}

/** 서버가 거절했을 때 런타임이 할 일. */
export type OperationStop =
  /** 잠금을 남이 쥐고 있다 — 시작하지 않고 그대로 보고. */
  | { kind: 'already_running'; existing: Record<string, unknown> | null }
  /** 임대 만료·이미 종료·청크 충돌 — 하던 일을 멈추고 창·탭을 풀고 finish를 부르지 않는다. */
  | { kind: 'fence_lost'; reason: string | null }
  /** 그 밖의 오류 — finish(failed)로 서버에 알린다(토큰이 아직 유효하면). */
  | { kind: 'report_failed' };

/**
 * 거절 코드 → 런타임 행동. 순수 규칙, 스펙으로 잠근다.
 * `OPERATION_FENCE_LOST`는 셋(expired·terminal·chunk_conflict) 모두 같은 행동이다:
 * 토큰이 이미 죽었으니 finish도 보내지 않는다.
 */
export function stopFor(code: string, details: Record<string, unknown> | null | undefined): OperationStop {
  if (code === 'OPERATION_IN_PROGRESS') {
    const existing = details?.existing;
    return { kind: 'already_running', existing: isObject(existing) ? existing : null };
  }
  if (code === 'OPERATION_FENCE_LOST' || code === 'OPERATION_NOT_FOUND') {
    const reason = details?.reason;
    return { kind: 'fence_lost', reason: typeof reason === 'string' ? reason : null };
  }
  return { kind: 'report_failed' };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
