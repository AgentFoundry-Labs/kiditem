import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { ApiError, isApiError } from '@/lib/api-error';
import { safeStorageGet, safeStorageSet } from '@/lib/browser-storage';
import { createSecureRandomUuid } from '@/lib/secure-random-uuid';

export const ORDER_COLLECTION_SOURCE_PATH = '/api/orders/collection';
export const ORDER_COLLECTION_IN_PROGRESS_MESSAGE =
  '이 몰의 앞선 수집이 아직 끝나지 않았습니다. 끝나거나 30분이 지나 자동으로 정리된 뒤 다시 눌러주세요.';
export const ORDER_COLLECTION_SOURCE_ATTEMPT_STORAGE_PREFIX =
  'kiditem:orders:collection-source-attempt';

const OrderCollectionSourcePlanSchema = z.object({
  sourceType: z.literal('order_collection_mall'),
  parserVersion: z.string(),
  mallKey: z.string().min(1),
  mallName: z.string().min(1),
  channelAccountId: z.string().min(1),
  collectionDate: z.string().nullable(),
  collectionMode: z.enum(['browser', 'manual-upload']),
  selectionMode: z.enum(['manual', 'automatic']).optional(),
  seenRowKeys: z.array(z.string().max(2_000)).max(8_000).optional(),
}).strict();

export const OrderCollectionSourceAttemptSchema = z.object({
  attemptId: z.string().uuid(),
  sourceImportRunId: z.string().uuid(),
  state: z.enum(['RUNNING', 'COMPLETE', 'FAILED']),
  plan: OrderCollectionSourcePlanSchema,
  expiresAt: z.string().datetime({ offset: true }).nullable(),
  artifactId: z.string().uuid().nullable(),
  coverageStartDate: z.string().date().nullable(),
  coverageEndDate: z.string().date().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
}).strict();

export const OrderCollectionSourceAttemptControlSchema =
  OrderCollectionSourceAttemptSchema.extend({
    attemptToken: z.string().uuid(),
  }).strict();

export type OrderCollectionSourceAttempt = z.infer<typeof OrderCollectionSourceAttemptSchema>;
export type OrderCollectionSourceAttemptControl = z.infer<
  typeof OrderCollectionSourceAttemptControlSchema
>;

export type OrderCollectionAttemptContext = {
  attemptId: string;
  attemptToken: string;
};

export type ActiveOrderCollectionAttempt = {
  attemptId: string | null;
  idempotencyKey: string | null;
  /** The mall an unfinished admission key was issued for. */
  mallKey?: string;
  collectionDate?: string | null;
  /** The mode the key was sent under; the owner fingerprints the begin with it. */
  collectionMode?: 'browser' | 'manual-upload';
  selectionMode?: 'manual' | 'automatic';
  seenRowKeys?: string[];
};

const ActiveOrderCollectionAttemptSchema = z.object({
  attemptId: z.string().uuid().nullable(),
  idempotencyKey: z.string().uuid().nullable(),
  mallKey: z.string().min(1).max(80).optional(),
  collectionDate: z.string().nullable().optional(),
  collectionMode: z.enum(['browser', 'manual-upload']).optional(),
  selectionMode: z.enum(['manual', 'automatic']).optional(),
  seenRowKeys: z.array(z.string().max(2_000)).max(8_000).optional(),
}).strict();

/** The browser origin distinguishes local and office extension environments. */
export function getOrderCollectionEnvironmentKey(): string {
  if (typeof window === 'undefined') return 'server';
  const origin = window.location.origin;
  return origin && origin !== 'null'
    ? origin
    : `${window.location.protocol}//${window.location.host}`;
}

/** Without `mallKey` this is the latest attempt of any mall; with it, that mall's own. */
export function orderCollectionSourceAttemptStorageKey(
  organizationId: string,
  environmentKey = getOrderCollectionEnvironmentKey(),
  mallKey?: string,
): string {
  return [
    ORDER_COLLECTION_SOURCE_ATTEMPT_STORAGE_PREFIX,
    encodeURIComponent(organizationId),
    encodeURIComponent(environmentKey),
    ...(mallKey ? [encodeURIComponent(mallKey)] : []),
  ].join(':');
}

export function readActiveOrderCollectionAttempt(
  organizationId: string,
  environmentKey = getOrderCollectionEnvironmentKey(),
  mallKey?: string,
): ActiveOrderCollectionAttempt | null {
  if (!organizationId) return null;
  const raw = safeStorageGet(
    'local',
    orderCollectionSourceAttemptStorageKey(organizationId, environmentKey, mallKey),
  );
  if (!raw) return null;
  try {
    const parsed = ActiveOrderCollectionAttemptSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function rememberActiveOrderCollectionAttempt(
  organizationId: string,
  attempt: ActiveOrderCollectionAttempt,
  environmentKey = getOrderCollectionEnvironmentKey(),
  mallKey?: string,
): void {
  if (!organizationId) return;
  safeStorageSet(
    'local',
    orderCollectionSourceAttemptStorageKey(organizationId, environmentKey, mallKey),
    JSON.stringify(attempt),
  );
}

export function newOrderCollectionIdempotencyKey(): string {
  return createSecureRandomUuid();
}

export function readOrderCollectionSourceAttempt(
  attemptId: string,
): Promise<OrderCollectionSourceAttempt> {
  return apiClient
    .getParsed(
      `${ORDER_COLLECTION_SOURCE_PATH}/attempts/${encodeURIComponent(attemptId)}`,
      OrderCollectionSourceAttemptSchema,
    )
    .then((attempt) => {
      if (attempt.attemptId !== attemptId) {
        throw new Error('주문 수집 시도 응답이 일치하지 않습니다.');
      }
      return attempt;
    });
}

export function readOrderCollectionSourceAttemptControl(
  attemptId: string,
): Promise<OrderCollectionSourceAttemptControl> {
  return apiClient
    .getParsed(
      `${ORDER_COLLECTION_SOURCE_PATH}/attempts/${encodeURIComponent(attemptId)}/control`,
      OrderCollectionSourceAttemptControlSchema,
    );
}

export function beginOrderCollectionSourceAttempt(
  idempotencyKey: string,
  input: {
    mallKey: string;
    collectionDate: string | null;
    collectionMode?: 'browser' | 'manual-upload';
    selectionMode?: 'manual' | 'automatic';
    seenRowKeys?: string[];
  },
): Promise<OrderCollectionSourceAttemptControl> {
  return apiClient
    .post<unknown>(
      `${ORDER_COLLECTION_SOURCE_PATH}/attempts`,
      {
        mallKey: input.mallKey,
        collectionDate: input.collectionDate,
        collectionMode: input.collectionMode ?? 'browser',
        ...(input.selectionMode ? { selectionMode: input.selectionMode } : {}),
        ...(input.seenRowKeys ? { seenRowKeys: [...input.seenRowKeys] } : {}),
      },
      { headers: { 'Idempotency-Key': idempotencyKey } },
    )
    .then((response) => OrderCollectionSourceAttemptControlSchema.parse(response))
    .catch((error: unknown) => {
      // The owner admits one running attempt per mall. This browser did not
      // start that attempt (another browser, or cleared storage), so it cannot
      // resume it; say so instead of the bare conflict code. The machine-readable
      // refusal travels with the sentence, so the screen can show the running
      // collection rather than record a failed start (KID-106 Q6).
      if (
        isApiError(error)
        && error.status === 409
        && error.code === 'ATTEMPT_IN_PROGRESS'
      ) {
        throw new ApiError(409, error.code, ORDER_COLLECTION_IN_PROGRESS_MESSAGE, error.details);
      }
      throw error;
    });
}

export function failOrderCollectionSourceAttempt(
  run: OrderCollectionAttemptContext,
  input: { code: string; message: string; sourcePayload?: unknown },
): Promise<OrderCollectionSourceAttempt> {
  return apiClient
    .post<unknown>(
      `${ORDER_COLLECTION_SOURCE_PATH}/attempts/${encodeURIComponent(run.attemptId)}/fail`,
      input,
      { headers: { 'x-source-attempt-token': run.attemptToken } },
    )
    .then((response) => OrderCollectionSourceAttemptSchema.parse(response));
}

export function orderCollectionAttemptHeaders(
  run: OrderCollectionAttemptContext | undefined,
): Record<string, string> {
  if (!run) return {};
  return {
    'x-order-collection-attempt-id': run.attemptId,
    'x-source-attempt-token': run.attemptToken,
  };
}

export function isOrderCollectionAttemptNotFound(error: unknown): boolean {
  return isApiError(error) && error.status === 404;
}
