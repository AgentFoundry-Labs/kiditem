import type { z } from 'zod';
import { ERROR_DEFINITIONS } from '@kiditem/shared/errors';
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
            // 같은 실행을 이 확장이 이미 돌리고 있으면(같은 idempotencyKey 재요청) 두 번째 수집은 하지 않는다.
            if (running.has(operationId)) controller.abort();
            else {
              running.set(operationId, controller);
              owned = operationId;
            }
            answer({ success: true, operationId, reused });
          },
        });
        const done = run.finally(() => {
          if (owned !== null) running.delete(owned);
        });
        deps.keepAlive?.(done);
        return Promise.race([begun, done.then(earlyResponse)]);
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
        error: ERROR_DEFINITIONS.OPERATION_IN_PROGRESS.text,
        details: { existing: outcome.existing },
      };
    case 'failed':
      return { success: false, errorCode: outcome.errorCode, error: outcome.errorMessage };
    case 'fence_lost':
      return { success: false, errorCode: 'OPERATION_FENCE_LOST', error: ERROR_DEFINITIONS.OPERATION_FENCE_LOST.text };
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
      error: ERROR_DEFINITIONS.VALIDATION_FAILED.text,
      details: { errors: parsed.error.issues.map((issue) => ({ field: issue.path.join('.'), reason: issue.message })) },
    },
  };
}
