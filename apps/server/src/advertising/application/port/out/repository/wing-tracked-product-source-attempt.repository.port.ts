import type {
  WingTrackedProductAttemptPlan,
  WingTrackedProductAttemptUpload,
  WingTrackedProductSourceView,
} from './wing-tracked-product.repository.port';

export const WING_TRACKED_PRODUCT_SOURCE_ATTEMPT_REPOSITORY_PORT = Symbol(
  'WingTrackedProductSourceAttemptRepositoryPort',
);

/**
 * Advertising-owned terminal persistence for the complete tracked-Wing
 * snapshot. This owns the attempt fence and Alert transaction; tracker CRUD
 * remains in the sibling repository contract.
 */
export interface WingTrackedProductSourceAttemptRepositoryPort {
  beginAttempt(input: {
    organizationId: string;
    idempotencyKey: string;
    keywords: readonly string[];
  }): Promise<WingTrackedProductAttemptPlan>;
  readAttemptControl(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<WingTrackedProductAttemptPlan | null>;
  readSourceStatus(input: {
    organizationId: string;
  }): Promise<WingTrackedProductSourceView>;
  submitAttempt(input: WingTrackedProductAttemptUpload): Promise<WingTrackedProductSourceView>;
  failAttempt(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    code: string;
    message: string;
  }): Promise<WingTrackedProductSourceView>;
  /** Operator stop without the attempt token; a terminal attempt is left unchanged. */
  cancelAttempt(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<WingTrackedProductSourceView>;
}
