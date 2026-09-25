import type { z } from 'zod';
import {
  OPERATION_TOKEN_HEADER,
  OperationBeginResponseSchema,
  OperationCancelResponseSchema,
  OperationChunkPutResponseSchema,
  OperationFinishResponseSchema,
  OperationInProgressDetailsSchema,
  type OperationBeginRequest,
  type OperationBeginResponse,
  type OperationChunkKind,
  type OperationChunkPutResponse,
  type OperationFinishRequest,
  type OperationFinishResponse,
  type OperationInProgressDetails,
  type OperationView,
} from '@kiditem/shared/operation';
import type { ApiPort } from './api';
import { RuntimeError, parseErrorEnvelope } from './errors';

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
  /** 잠금을 남이 쥐고 있다 — 시작하지 않고 그대로 보고. `existing`은 서버가 이름한 돌고 있는 실행. */
  | { kind: 'already_running'; existing: OperationInProgressDetails | null }
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
    // 서버 봉투의 details가 곧 돌고 있는 실행이다(`OperationInProgressDetailsSchema`, 감싸지 않음).
    const existing = OperationInProgressDetailsSchema.safeParse(details);
    return { kind: 'already_running', existing: existing.success ? existing.data : null };
  }
  if (code === 'OPERATION_FENCE_LOST' || code === 'OPERATION_NOT_FOUND') {
    const reason = details?.reason;
    return { kind: 'fence_lost', reason: typeof reason === 'string' ? reason : null };
  }
  return { kind: 'report_failed' };
}

/** 서버에 닿지 못했거나(네트워크·프록시) 계약 밖 응답을 받았다. */
export const RUNTIME_API_UNREACHABLE = 'RUNTIME_API_UNREACHABLE' as const;

/**
 * `ApiPort` 위의 실행 계약 클라이언트. 응답은 shared Zod로 읽고, 2xx가 아니면 서버 오류 봉투를
 * `RuntimeError(code, message, details)`로 바꾼다. 청크 checksum은 여기서 계산한다(호출자는 payload만).
 */
export function createOperationClient(api: ApiPort): OperationClient {
  const base = '/api/operations';
  return {
    begin: (request) => call(api, base, { method: 'POST', body: request }, OperationBeginResponseSchema),
    async putChunk({ operationId, token, chunkKind, sequence, payload, progress }) {
      const checksum = await sha256Hex(JSON.stringify(payload));
      return call(
        api,
        `${base}/${encodeURIComponent(operationId)}/chunks/${encodeURIComponent(chunkKind)}/${sequence}`,
        { method: 'PUT', token, body: { checksum, payload, ...(progress ? { progress } : {}) } },
        OperationChunkPutResponseSchema,
      );
    },
    finish: ({ operationId, token, request }) =>
      call(api, `${base}/${encodeURIComponent(operationId)}/finish`, { method: 'POST', token, body: request }, OperationFinishResponseSchema),
    async cancel(operationId) {
      const response = await call(api, `${base}/${encodeURIComponent(operationId)}/cancel`, { method: 'POST' }, OperationCancelResponseSchema);
      return response.operation;
    },
  };
}

async function call<S extends z.ZodTypeAny>(
  api: ApiPort,
  path: string,
  request: { method: string; token?: string; body?: unknown },
  schema: S,
): Promise<z.output<S>> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (request.token !== undefined) headers[OPERATION_TOKEN_HEADER] = request.token;
  let response: Response;
  try {
    response = await api.fetch(path, {
      method: request.method,
      headers,
      ...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {}),
    });
  } catch (error) {
    // 입구 어댑터가 코드를 실어 던지면(옛 authedFetch의 `environment_auth_required` 등) 그 코드를 살린다.
    const code = (error as { code?: unknown } | null)?.code;
    if (typeof code === 'string' && code.trim()) {
      const message = error instanceof Error && error.message ? error.message : 'KidItem 서버 요청이 거절됐습니다.';
      throw new RuntimeError(code.trim().slice(0, 100), message, { path }, error);
    }
    throw new RuntimeError(RUNTIME_API_UNREACHABLE, 'KidItem 서버에 연결하지 못했습니다.', { path }, error);
  }
  const body = await response.json().catch(() => undefined);
  if (!response.ok) {
    const envelope = parseErrorEnvelope(body);
    if (!envelope) {
      throw new RuntimeError(RUNTIME_API_UNREACHABLE, 'KidItem 서버 응답을 읽지 못했습니다.', { path, status: response.status });
    }
    throw new RuntimeError(envelope.code, envelope.message, envelope.details ?? null);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new RuntimeError(RUNTIME_API_UNREACHABLE, 'KidItem 서버 응답이 실행 계약과 다릅니다.', { path, status: response.status });
  }
  return parsed.data;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
