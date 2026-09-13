import type { ReviewIngestItem } from '@kiditem/shared/reviews';

export const REVIEW_COLLECTION_SOURCE_PORT = Symbol('REVIEW_COLLECTION_SOURCE_PORT');

export const COUPANG_REVIEW_COLLECTION_SOURCE_TYPE = 'coupang_reviews' as const;
export const COUPANG_REVIEW_COLLECTION_PARSER_VERSION = 'coupang-review-v1' as const;
export const COUPANG_REVIEW_COLLECTION_PAGE_SIZE = 50 as const;
export const COUPANG_REVIEW_COLLECTION_MAX_PAGES = 40 as const;
export const COUPANG_REVIEW_COLLECTION_MAX_MONTHS = 36 as const;

export type ReviewCollectionWindow = {
  index: number;
  label: string;
  start: string;
  end: string;
};

export type ReviewCollectionPlan = {
  sourceType: typeof COUPANG_REVIEW_COLLECTION_SOURCE_TYPE;
  parserVersion: typeof COUPANG_REVIEW_COLLECTION_PARSER_VERSION;
  months: number;
  windows: ReviewCollectionWindow[];
  pageSize: typeof COUPANG_REVIEW_COLLECTION_PAGE_SIZE;
  maxPagesPerWindow: typeof COUPANG_REVIEW_COLLECTION_MAX_PAGES;
};

export type ReviewCollectionAttempt = {
  attemptId: string;
  sourceImportRunId: string;
  state: 'RUNNING' | 'COMPLETE' | 'FAILED';
  plan: ReviewCollectionPlan;
  expiresAt: string | null;
  completedWindows: number[];
  windowReceipts: ReviewCollectionWindowCompletion[];
  coverageStartDate: string | null;
  coverageEndDate: string | null;
  collected: number;
  created: number;
  updated: number;
  linked: number;
  unlinked: number;
  errorCode: string | null;
  errorMessage: string | null;
};

export type ReviewCollectionAttemptControl = ReviewCollectionAttempt & {
  attemptToken: string;
};

export type ReviewCollectionWindowReceipt = {
  windowIndex: number;
  sequence: number;
  items: ReviewIngestItem[];
};

export type ReviewCollectionWindowCompletion = {
  windowIndex: number;
  itemCount: number;
  pageCount: number;
  pageLimitReached: boolean;
  coverageStartDate: string;
  coverageEndDate: string;
};

export type ReviewCollectionSourcePort = {
  beginAttempt(input: {
    organizationId: string;
    userId?: string;
    idempotencyKey: string;
    months: number;
  }): Promise<ReviewCollectionAttemptControl>;

  readAttempt(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<ReviewCollectionAttempt | null>;

  readAttemptControl(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<ReviewCollectionAttemptControl | null>;

  appendChunk(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    receipt: ReviewCollectionWindowReceipt;
  }): Promise<ReviewCollectionAttempt>;

  completeWindow(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    completion: ReviewCollectionWindowCompletion;
  }): Promise<ReviewCollectionAttempt>;

  completeAttempt(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
  }): Promise<ReviewCollectionAttempt>;

  failAttempt(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    errorCode: string;
    errorMessage: string;
  }): Promise<ReviewCollectionAttempt>;

  cancelAttempt(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
  }): Promise<ReviewCollectionAttempt>;
};
