import type { StartChildOperation } from '../../../../common/operation-definition';
import type { OperationRunRecord } from '../out/repository/operation.repository.port';

export const COMPOSITE_OPERATION_COORDINATOR_PORT = Symbol(
  'COMPOSITE_OPERATION_COORDINATOR_PORT',
);

export interface CompositeOperationCoordinatorPort {
  waitForChild(input: {
    parent: OperationRunRecord;
    child: StartChildOperation;
  }): Promise<void>;
  listChildren(input: {
    organizationId: string;
    parentRunId: string;
  }): Promise<OperationRunRecord[]>;
  resumeTerminalChildren(now: Date): Promise<void>;
  cancelChildren(parent: OperationRunRecord, reason: string): Promise<void>;
}
