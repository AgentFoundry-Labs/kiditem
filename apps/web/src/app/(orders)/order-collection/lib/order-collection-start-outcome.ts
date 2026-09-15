import { friendlyError } from '@/lib/api-error';
import { attemptInProgress } from '@/lib/collection-start';
import { OrderCollectionExtensionUnavailableError } from './order-collection-extension';
import { mallCollectionFailureMessage } from './order-collection-page-model';
import { ORDER_COLLECTION_IN_PROGRESS_MESSAGE } from './order-collection-source-owner';

/**
 * The mall's collection is already running, so no second attempt was opened:
 * this screen's own start for the mall is still in flight. The owner says the
 * same thing with a 409 `ATTEMPT_IN_PROGRESS`.
 */
export class OrderCollectionAlreadyRunningError extends Error {
  readonly attemptId: string | null;

  constructor(
    message: string = ORDER_COLLECTION_IN_PROGRESS_MESSAGE,
    attemptId: string | null = null,
  ) {
    super(message);
    this.name = 'OrderCollectionAlreadyRunningError';
    this.attemptId = attemptId;
  }
}

/**
 * Why a mall's collection did not run (KID-106 Q6, KID-147 ①).
 * - `in_progress`: the same mall and scope is already collecting. Nothing new
 *   was opened and nothing failed; the operator sees the running collection.
 * - `extension_unavailable`: the browser extension could not take the work.
 *   The mall is fine; the extension is what needs attention.
 * - `start_failed`: everything else, told with the mall's own reason.
 */
export type OrderCollectionStartOutcome =
  | Readonly<{ outcome: 'in_progress'; attemptId: string | null; message: string }>
  | Readonly<{ outcome: 'extension_unavailable'; message: string }>
  | Readonly<{ outcome: 'start_failed'; message: string }>;

/** Whether this failure only means the mall is already collecting. */
export function isOrderCollectionInProgress(error: unknown): boolean {
  return error instanceof OrderCollectionAlreadyRunningError || attemptInProgress(error) !== null;
}

export function classifyOrderCollectionStart(
  error: unknown,
  mallName: string,
): OrderCollectionStartOutcome {
  if (error instanceof OrderCollectionAlreadyRunningError) {
    return {
      outcome: 'in_progress',
      attemptId: error.attemptId,
      message: ORDER_COLLECTION_IN_PROGRESS_MESSAGE,
    };
  }
  const running = attemptInProgress(error);
  if (running) {
    return {
      outcome: 'in_progress',
      attemptId: running.attemptId,
      message: ORDER_COLLECTION_IN_PROGRESS_MESSAGE,
    };
  }
  if (error instanceof OrderCollectionExtensionUnavailableError) {
    return { outcome: 'extension_unavailable', message: error.message };
  }
  return {
    outcome: 'start_failed',
    message: mallCollectionFailureMessage(mallName, friendlyError(error) ?? '브라우저 수집 실패'),
  };
}
