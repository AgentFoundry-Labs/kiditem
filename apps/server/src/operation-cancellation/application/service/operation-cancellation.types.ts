import {
  emptyCancelOperationAffected,
  emptyCancelOperationPreserved,
  type CancelOperationAffected,
  type CancelOperationPreserved,
  type CancelOperationResponse,
  type CancelOperationStatus,
  type CancelOperationTarget,
} from '@kiditem/shared/operation-cancellation';

export type {
  CancelOperationAffected,
  CancelOperationPreserved,
  CancelOperationStatus,
  CancelOperationTarget,
};

export interface CancelOperationCommand {
  organizationId: string;
  actorUserId: string | null;
  target: CancelOperationTarget;
}

export type CancelOperationResult = CancelOperationResponse;

export function emptyAffected(): CancelOperationAffected {
  return emptyCancelOperationAffected();
}

export function emptyPreserved(): CancelOperationPreserved {
  return emptyCancelOperationPreserved();
}
