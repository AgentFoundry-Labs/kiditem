import { Inject, Injectable } from '@nestjs/common';
import { parseOperationRunName } from '@kiditem/shared/identifiers';
import {
  OPERATION_CHECKPOINT_REPOSITORY_PORT,
  type OperationCheckpointRepositoryPort,
} from '../../../../operations/application/port/out/repository/operation-checkpoint.repository.port';
import {
  OPERATION_REPOSITORY_PORT,
  type OperationRunRepositoryPort,
} from '../../../../operations/application/port/out/repository/operation.repository.port';
import type { OperationsSessionExecutionPort } from '../../../application/port/out/cross-domain/operations-session-execution.port';

@Injectable()
export class OperationsSessionExecutionAdapter implements OperationsSessionExecutionPort {
  constructor(
    @Inject(OPERATION_REPOSITORY_PORT) private readonly operations: OperationRunRepositoryPort,
    @Inject(OPERATION_CHECKPOINT_REPOSITORY_PORT) private readonly checkpoints: OperationCheckpointRepositoryPort,
  ) {}

  async findOperation(input: { organizationId: string; operation: string }) {
    const operation = parseOperationRunName(input.operation);
    if (operation.organization !== input.organizationId) return null;
    const run = await this.operations.findRunById({
      organizationId: input.organizationId,
      runId: operation.operation,
    });
    return run ? { input: run.input } : null;
  }

  async findLatestCheckpoint(input: { organizationId: string; operation: string }) {
    const operation = parseOperationRunName(input.operation);
    if (operation.organization !== input.organizationId) return null;
    return this.checkpoints.findLatest({
      organizationId: input.organizationId,
      operationRunId: operation.operation,
    });
  }

  async appendCheckpoint(input: {
    organizationId: string;
    operation: string;
    kind: string;
    state: Record<string, unknown>;
  }): Promise<void> {
    const operation = parseOperationRunName(input.operation);
    if (operation.organization !== input.organizationId) {
      throw new Error('OPERATIONS_SESSION_EXECUTION_SCOPE_INVALID');
    }
    await this.checkpoints.append({
      organizationId: input.organizationId,
      operationRunId: operation.operation,
      kind: input.kind,
      state: input.state,
    });
  }
}
