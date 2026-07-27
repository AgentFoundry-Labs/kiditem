import { BrowserCollectionRunIdSchema } from '@kiditem/shared/browser-collection-session';

const SERVER_CANCELLABLE_SOURCE_TYPES = new Set([
  'content_generation',
  'thumbnail_generation',
  'image_ai_job',
  'agent_run_request',
  'agent_run',
  'workflow_run',
]);

type OperationAlertActionInput = {
  status: string;
  operationKey: string | null | undefined;
  sourceType: string | null | undefined;
  metadata?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function hasCancellableChild(metadata: unknown): boolean {
  const childIds = asRecord(asRecord(metadata).childIds);
  return [
    childIds.detailPageGenerationId,
    childIds.thumbnailGenerationId,
  ].some((value) => typeof value === 'string' && value.length > 0);
}

function isBrowserCollectionOperationKey(
  operationKey: string,
): boolean {
  const prefix = 'browser-collection:';
  if (!operationKey.startsWith(prefix)) return false;
  return BrowserCollectionRunIdSchema.safeParse(
    operationKey.slice(prefix.length),
  ).success;
}

export function isOperationAlertCancellable({
  status,
  operationKey,
  sourceType,
  metadata,
}: OperationAlertActionInput): boolean {
  if (status !== 'running' && status !== 'pending') return false;
  if (!operationKey) return false;
  if (isBrowserCollectionOperationKey(operationKey)) return true;
  if (sourceType && SERVER_CANCELLABLE_SOURCE_TYPES.has(sourceType)) {
    return true;
  }
  return hasCancellableChild(metadata);
}
