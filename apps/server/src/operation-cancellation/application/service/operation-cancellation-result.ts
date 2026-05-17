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

export interface LinkedAgentCancellationCounts {
  cancelledAgentRunRequests: number;
  cancelledAgentRuns: number;
}

export interface AgentCancellationCounts {
  cancelledRequests: number;
  cancelledRuns: number;
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

export function linkedAgentCancellationWarnings(
  result: LinkedAgentCancellationCounts,
): string[] {
  const warnings: string[] = [];
  if (result.cancelledAgentRunRequests > 0) {
    warnings.push(linkedAgentRequestsWarning(result.cancelledAgentRunRequests));
  }
  if (result.cancelledAgentRuns > 0) {
    warnings.push(linkedAgentRunsWarning(result.cancelledAgentRuns));
  }
  return warnings;
}

export function linkedAgentRequestsWarning(count: number): string {
  return `Linked Agent OS requests cancelled: ${count}`;
}

export function linkedAgentRunsWarning(count: number): string {
  return `Linked Agent OS runs cancelled: ${count}`;
}

export function agentCancellationWasApplied(
  result: AgentCancellationCounts | undefined,
): boolean {
  return result ? result.cancelledRequests + result.cancelledRuns > 0 : false;
}
