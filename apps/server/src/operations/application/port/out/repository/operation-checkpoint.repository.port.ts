export const OPERATION_CHECKPOINT_REPOSITORY_PORT = Symbol(
  'OPERATION_CHECKPOINT_REPOSITORY_PORT',
);

export interface OperationRunCheckpointRecord {
  id: string;
  organizationId: string;
  operationRunId: string;
  sequence: bigint;
  kind: string;
  state: Record<string, unknown>;
  createdAt: Date;
}

export interface OperationCheckpointRepositoryPort {
  append(input: {
    organizationId: string;
    operationRunId: string;
    kind: string;
    state: Record<string, unknown>;
  }): Promise<OperationRunCheckpointRecord>;
  findLatest(input: {
    organizationId: string;
    operationRunId: string;
  }): Promise<OperationRunCheckpointRecord | null>;
}
