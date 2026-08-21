import type { OperationRunName } from '@kiditem/shared/identifiers';

export const OPERATIONS_SESSION_EXECUTION_PORT = Symbol(
  'OPERATIONS_SESSION_EXECUTION_PORT',
);

export interface OperationsSessionExecutionPort {
  findOperation(input: {
    organizationId: string;
    operation: OperationRunName;
  }): Promise<{ input: Record<string, unknown> } | null>;
  findLatestCheckpoint(input: {
    organizationId: string;
    operation: OperationRunName;
  }): Promise<{
    kind: string;
    state: Record<string, unknown>;
  } | null>;
  appendCheckpoint(input: {
    organizationId: string;
    operation: OperationRunName;
    kind: string;
    state: Record<string, unknown>;
  }): Promise<void>;
}
