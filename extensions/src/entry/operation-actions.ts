import type { z } from 'zod';
import { collectorFor } from '../collectors';
import type { ApiPort } from '../core/api';
import type { BrowserResources } from '../core/browser';
import { isRuntimeError } from '../core/errors';
import { createOperationClient, type OperationClient } from '../core/operation-client';
import { createRunner, type OperationRunner, type RunOutcome, type RunnerDeps } from '../core/runner';
import {
  OPERATION_CANCEL_ACTION,
  OPERATION_START_ACTION,
  OperationCancelMessageSchema,
  OperationStartMessageSchema,
  type OperationCancelMessage,
  type OperationStartMessage,
  type OperationStartResponse,
} from './actions';

/**
 * 서버 message가 없을 때 확장이 스스로 내는 문장. 서버가 거절했으면 서버 message를 그대로 쓴다
 * (shared 오류 레지스트리 전체를 번들에 싣지 않는다).
 */
const LOCAL_TEXT = {
  VALIDATION_FAILED: '입력값이 올바르지 않습니다. 표시된 항목을 확인해 주세요.',
  OPERATION_IN_PROGRESS: '같은 실행이 이미 진행 중입니다. 끝나거나 중단한 뒤 다시 시작해 주세요.',
  OPERATION_FENCE_LOST: '이 실행은 더 이상 유효하지 않습니다. 다시 시작해 주세요.',
} as const;

type FailureResponse = Extract<OperationStartResponse, { success: false }>;
type Validated<T> = { ok: true; message: T } | { ok: false; response: FailureResponse };

export interface OperationActionsDeps {
  /** 환경(local·office) → 그 환경의 KidItem API. 토큰은 이 포트가 싣는다. */
  apiFor(environmentId: string): ApiPort;
  browser: BrowserResources;
  siteFor?: RunnerDeps['siteFor'];
  /** 실행이 끝날 때까지 서비스워커를 살려 둔다(옛 워커의 keep-alive). */
  keepAlive?(work: Promise<unknown>): void;
}

export interface ExternalAction<T> {
  /** 던지지 않는다 — 옛 dispatch는 validate 예외에 errorCode를 싣지 않으므로 실패도 값으로 넘긴다. */
  validate(message: unknown): Validated<T>;
  handle(input: Validated<T>, environmentId: string): Promise<unknown>;
}

/**
 * 웹앱 메시지 `operation.start`·`operation.cancel` → core. 환경마다 client·runner를 한 번 만들어 둔다.
 * start는 begin이 성공하면 바로 `{success, operationId, reused}`로 답하고 실행은 뒤에서 계속된다.
 */
export function createOperationActions(deps: OperationActionsDeps): {
  [OPERATION_START_ACTION]: ExternalAction<OperationStartMessage>;
  [OPERATION_CANCEL_ACTION]: ExternalAction<OperationCancelMessage>;
} {
  const environments = new Map<string, { client: OperationClient; runner: OperationRunner }>();
  const running = new Map<string, AbortController>();

  function forEnvironment(environmentId: string) {
    let entry = environments.get(environmentId);
    if (!entry) {
      const client = createOperationClient(deps.apiFor(environmentId));
      const runner = createRunner({ client, browser: deps.browser, siteFor: deps.siteFor ?? (() => null) }, collectorFor);
      entry = { client, runner };
      environments.set(environmentId, entry);
    }
    return entry;
  }

  return {
    [OPERATION_START_ACTION]: {
      validate: (message) => validateWith(OperationStartMessageSchema, message),
      async handle(input, environmentId) {
        if (!input.ok) return input.response;
        const { kind, scope, idempotencyKey } = input.message;
        const controller = new AbortController();
        let owned: string | null = null;
        let answer!: (response: OperationStartResponse) => void;
        const begun = new Promise<OperationStartResponse>((resolve) => { answer = resolve; });
        const run = forEnvironment(environmentId).runner.run({
          kind,
          scope,
          ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
          signal: controller.signal,
          onBegun({ operationId, reused }) {
            running.set(operationId, controller);
            owned = operationId;
            answer({ success: true, operationId, reused });
          },
        });
        const done = run.finally(() => {
          if (owned !== null) running.delete(owned);
        });
        deps.keepAlive?.(done);
        return Promise.race([
          begun,
          done.then((outcome) =>
            // 같은 idempotencyKey 재요청이고 이 확장이 그 실행을 돌리고 있으면 그대로 이어지는 중이다.
            outcome.kind === 'already_running' && outcome.reused && outcome.existing && running.has(outcome.existing.operationId)
              ? { success: true as const, operationId: outcome.existing.operationId, reused: true }
              : earlyResponse(outcome),
          ),
        ]);
      },
    },
    [OPERATION_CANCEL_ACTION]: {
      validate: (message) => validateWith(OperationCancelMessageSchema, message),
      async handle(input, environmentId) {
        if (!input.ok) return input.response;
        const { operationId } = input.message;
        try {
          const operation = await forEnvironment(environmentId).client.cancel(operationId);
          return { success: true, operation };
        } catch (error) {
          return failure(error);
        } finally {
          running.get(operationId)?.abort();
        }
      },
    },
  };
}

/** begin 전에 끝난 실행(거절·모르는 kind)의 답. begin이 성공했으면 onBegun이 먼저 답했다. */
function earlyResponse(outcome: RunOutcome): OperationStartResponse {
  switch (outcome.kind) {
    case 'already_running':
      return {
        success: false,
        errorCode: 'OPERATION_IN_PROGRESS',
        error: outcome.message ?? LOCAL_TEXT.OPERATION_IN_PROGRESS,
        details: { existing: outcome.existing },
      };
    case 'failed':
      return { success: false, errorCode: outcome.errorCode, error: outcome.errorMessage, ...(outcome.details ? { details: outcome.details } : {}) };
    case 'fence_lost':
      return { success: false, errorCode: 'OPERATION_FENCE_LOST', error: LOCAL_TEXT.OPERATION_FENCE_LOST };
    case 'finished':
      return { success: true, operationId: outcome.operation.id, reused: false };
  }
}

function failure(error: unknown): FailureResponse {
  if (isRuntimeError(error)) return { success: false, errorCode: error.code, error: error.message, details: error.details };
  return { success: false, errorCode: 'RUNTIME_API_UNREACHABLE', error: error instanceof Error ? error.message : String(error) };
}

function validateWith<S extends z.ZodTypeAny>(schema: S, message: unknown): Validated<z.output<S>> {
  const parsed = schema.safeParse(message);
  if (parsed.success) return { ok: true, message: parsed.data };
  return {
    ok: false,
    response: {
      success: false,
      errorCode: 'VALIDATION_FAILED',
      error: LOCAL_TEXT.VALIDATION_FAILED,
      details: { errors: parsed.error.issues.map((issue) => ({ field: issue.path.join('.'), reason: issue.message })) },
    },
  };
}
