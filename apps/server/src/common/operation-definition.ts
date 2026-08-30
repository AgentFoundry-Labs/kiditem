import type {
  OperationEngineType,
  OperationResourceClass,
  OperationTriggerSource,
} from '@kiditem/shared/operations';
import type { z } from 'zod';

export interface OperationDefinition {
  key: string;
  version: number;
  title: string;
  ownerDomain: string;
  engineType: OperationEngineType;
  allowedTriggers: readonly OperationTriggerSource[];
  scheduleSupported: boolean;
  maxAttempts: number;
  resourceClass: OperationResourceClass;
  executionTimeoutMs: number;
  inputSchema: z.ZodType<Record<string, unknown>>;
  successPersistence?: 'retained' | 'ephemeral_on_success';
}

export interface OperationHandlerContext {
  runId: string;
  organizationId: string;
  operationKey: string;
  triggerSource: OperationTriggerSource;
  input: Record<string, unknown>;
  requestedByUserId: string | null;
  scheduleId: string | null;
  parentRunId: string | null;
  attemptToken: string;
  signal: AbortSignal;
  attempts: number;
  maxAttempts: number;
  checkpoint(update?: {
    stage?: string;
    progressCurrent?: number;
    progressTotal?: number;
  }): Promise<void>;
  enterEphemeralFinalization(): Promise<{ signal: AbortSignal }>;
}

export interface OperationCancelContext {
  runId: string;
  organizationId: string;
  operationKey: string;
  reason: string | null;
  requestedByUserId: string | null;
}

export interface StartChildOperation {
  operationKey: string;
  input: Record<string, unknown>;
  idempotencyKey: string;
}

export type OperationHandlerResult =
  | { kind: 'completed'; result: Record<string, unknown> }
  | { kind: 'delegated'; nativeRunType: string; nativeRunId: string }
  | { kind: 'waiting_runtime' }
  | { kind: 'waiting_dependency'; child: StartChildOperation }
  | { kind: 'waiting_dependencies'; children: StartChildOperation[] }
  | { kind: 'attention_required'; reason: string; result: Record<string, unknown> }
  | { kind: 'cancelled'; result: Record<string, unknown> }
  | { kind: 'failed'; code: string; message: string }
  | {
      kind: 'retryable';
      code: string;
      message: string;
      retryAfterMs: number;
    };

export interface OperationHandler {
  execute(context: OperationHandlerContext): Promise<OperationHandlerResult>;
  cancel?(context: OperationCancelContext): Promise<void>;
  fenceExternalAuthority?(
    context: OperationCancelContext,
  ): Promise<'fenced' | 'unknown'>;
  finalizeEphemeralSuccess?(
    context: OperationHandlerContext,
    result: Record<string, unknown>,
  ): Promise<void>;
  exhaustRetry?(
    context: OperationHandlerContext,
    failure: { code: string; message: string },
  ): Promise<void>;
}
