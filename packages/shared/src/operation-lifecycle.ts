import { z } from 'zod';

export const OPERATION_STATUSES = [
  'prepared',
  'executing',
  'reconciling',
  'succeeded',
  'failed',
  'cancelled',
] as const;

export const PROVIDER_OUTCOMES = [
  'not_attempted',
  'uncertain',
  'succeeded',
  'definitive_failure',
] as const;

export const OperationStatusSchema = z.enum(OPERATION_STATUSES);
export const ProviderOutcomeSchema = z.enum(PROVIDER_OUTCOMES);

export type OperationStatus = z.infer<typeof OperationStatusSchema>;
export type ProviderOutcome = z.infer<typeof ProviderOutcomeSchema>;

export function isOperationTerminal(status: OperationStatus): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'cancelled';
}

export function canRetryProviderSideEffect(
  status: OperationStatus,
  providerOutcome: ProviderOutcome,
): boolean {
  return !isOperationTerminal(status) && providerOutcome === 'not_attempted';
}
