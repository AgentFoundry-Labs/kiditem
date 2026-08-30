export const OPERATION_RUN_EVENTS = {
  FINALIZED: 'operation.run.finalized',
} as const;

export interface OperationRunFinalizedEvent {
  organizationId: string;
  runId: string;
  status: 'succeeded' | 'failed' | 'cancelled' | 'attention_required';
  errorCode: string | null;
  errorMessage: string | null;
}
