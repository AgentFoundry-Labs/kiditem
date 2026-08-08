export const ACTIVE_COLLECTION_STATUSES = [
  'collecting',
  'cancel_requested',
] as const;

export type ActiveCollectionStatus = (typeof ACTIVE_COLLECTION_STATUSES)[number];

export const TERMINAL_COLLECTION_STATUSES = [
  'complete',
  'partial',
  'failed',
  'quarantined',
  'cancelled',
  'superseded',
] as const;

export type TerminalCollectionStatus =
  (typeof TERMINAL_COLLECTION_STATUSES)[number];

export type SourcingCollectionRunStatus =
  | ActiveCollectionStatus
  | TerminalCollectionStatus;

export function isActiveCollectionStatus(
  status: string,
): status is ActiveCollectionStatus {
  return (ACTIVE_COLLECTION_STATUSES as readonly string[]).includes(status);
}

export function isTerminalCollectionStatus(
  status: string,
): status is TerminalCollectionStatus {
  return (TERMINAL_COLLECTION_STATUSES as readonly string[]).includes(status);
}

export function terminalStatusForCollectionError(input: {
  code: string;
}): TerminalCollectionStatus {
  if (input.code === 'COLLECTION_CANCELLED') return 'cancelled';
  if (input.code === 'COLLECTION_SUPERSEDED') return 'superseded';
  return 'failed';
}
