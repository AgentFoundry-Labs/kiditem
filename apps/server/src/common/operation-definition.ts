import type {
  OperationEngineType,
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
  inputSchema: z.ZodType<Record<string, unknown>>;
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
  | { kind: 'attention_required'; reason: string; result: Record<string, unknown> }
  | { kind: 'failed'; code: string; message: string };

export interface OperationHandler {
  execute(context: OperationHandlerContext): Promise<OperationHandlerResult>;
  cancel?(context: OperationCancelContext): Promise<void>;
}
