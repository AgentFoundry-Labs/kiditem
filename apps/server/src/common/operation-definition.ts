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

export type OperationHandlerResult =
  | { kind: 'completed'; result: Record<string, unknown> }
  | { kind: 'delegated'; nativeRunType: string; nativeRunId: string }
  | { kind: 'waiting_runtime' };

export interface OperationHandler {
  execute(context: OperationHandlerContext): Promise<OperationHandlerResult>;
  cancel?(context: OperationCancelContext): Promise<void>;
}
