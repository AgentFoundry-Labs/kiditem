import type {
  CancelOperationAffected,
  CancelOperationPreserved,
  CancelOperationResult,
  CancelOperationStatus,
} from './operation-cancellation.types';
import { emptyAffected, emptyPreserved } from './operation-cancellation.types';

export interface BuildCancelOperationResultInput {
  status: CancelOperationStatus;
  message: string;
  operationKey: string | null;
  affected?: CancelOperationAffected;
  preserved?: CancelOperationPreserved;
  warnings?: string[];
}

export function buildCancelOperationResult(
  input: BuildCancelOperationResultInput,
): CancelOperationResult {
  return {
    ok: true,
    status: input.status,
    message: input.message,
    operationKey: input.operationKey,
    affected: input.affected ?? emptyAffected(),
    preserved: input.preserved ?? emptyPreserved(),
    warnings: input.warnings ?? [],
  };
}
