import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { safeStorageGet, safeStorageSet } from '@/lib/browser-storage';
import { createSecureRandomUuid } from '@/lib/secure-random-uuid';
import {
  detectOrderCollectionExtensionRuntime,
  sendToExtension,
} from '@/lib/extension-bridge';
import type { SellpiaTrackingRow } from './icecream-tracking-api';

export const SELLPIA_SHIPMENT_TRACKING_SOURCE_PATH =
  '/api/orders/sellpia-shipment-tracking';
export const SELLPIA_SHIPMENT_TRACKING_EXTENSION_ACTION =
  'collectSellpiaDeliTracking';
export const SELLPIA_SHIPMENT_TRACKING_EXTENSION_CAPABILITY =
  'sellpiaShipmentTrackingSourceOwnerV1';
export const SELLPIA_SHIPMENT_TRACKING_SOURCE_ATTEMPT_STORAGE_PREFIX =
  'kiditem:orders:sellpia-shipment-tracking-attempt';

const SellpiaShipmentTrackingSourcePlanSchema = z.object({
  sourceType: z.literal('sellpia_shipment_tracking'),
  parserVersion: z.literal('sellpia-shipment-tracking-v1'),
  sourceOrigin: z.literal('https://kiditem.sellpia.com'),
  sourceAccountKey: z.literal('kiditem'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).refine((plan) => plan.startDate <= plan.endDate, 'date range must be ordered');

export const SellpiaShipmentTrackingSourceAttemptSchema = z.object({
  attemptId: z.string().uuid(),
  sourceImportRunId: z.string().uuid(),
  state: z.enum(['RUNNING', 'COMPLETE', 'FAILED']),
  plan: SellpiaShipmentTrackingSourcePlanSchema,
  coverageStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  coverageEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  expiresAt: z.string().datetime({ offset: true }).nullable(),
  artifactId: z.string().uuid().nullable(),
  sourceFileName: z.string().nullable(),
  sourceContentType: z.string().nullable(),
  contentChecksum: z.string().regex(/^[0-9a-f]{64}$/i).nullable(),
  sourceByteCount: z.number().int().nonnegative().nullable(),
  errorCode: z.string().max(100).nullable(),
  errorMessage: z.string().max(300).nullable(),
}).strict();

export const SellpiaShipmentTrackingSourceAttemptControlSchema =
  SellpiaShipmentTrackingSourceAttemptSchema.extend({
    attemptToken: z.string().uuid(),
  }).strict();

const SellpiaShipmentTrackingSourcePayloadSchema = z.object({
  rows: z.array(z.object({
    ordNo: z.string(),
    itemNo: z.string(),
    invNo: z.string(),
    courier: z.string(),
    provider: z.string(),
    receiver: z.string().optional(),
    post: z.string().optional(),
    addr: z.string().optional(),
  }).strict()),
  total: z.number().int().nonnegative(),
  range: z.object({
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).strict(),
  confirmedRange: z.object({
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).strict().nullable().default(null),
}).strict();

export type SellpiaShipmentTrackingSourceAttempt = z.infer<
  typeof SellpiaShipmentTrackingSourceAttemptSchema
>;
export type SellpiaShipmentTrackingSourceAttemptControl = z.infer<
  typeof SellpiaShipmentTrackingSourceAttemptControlSchema
>;
export type SellpiaShipmentTrackingSourcePayload = z.infer<
  typeof SellpiaShipmentTrackingSourcePayloadSchema
>;

export type ActiveSellpiaShipmentTrackingAttempt = {
  attemptId: string | null;
  idempotencyKey: string | null;
};

const ActiveAttemptSchema = z.object({
  attemptId: z.string().uuid().nullable(),
  idempotencyKey: z.string().uuid().nullable(),
}).strict();

export function getSellpiaShipmentTrackingEnvironmentKey(): string {
  if (typeof window === 'undefined') return 'server';
  const origin = window.location.origin;
  return origin && origin !== 'null'
    ? origin
    : `${window.location.protocol}//${window.location.host}`;
}

export function sellpiaShipmentTrackingAttemptStorageKey(
  organizationId: string,
  environmentKey = getSellpiaShipmentTrackingEnvironmentKey(),
): string {
  return [
    SELLPIA_SHIPMENT_TRACKING_SOURCE_ATTEMPT_STORAGE_PREFIX,
    encodeURIComponent(organizationId),
    encodeURIComponent(environmentKey),
  ].join(':');
}

export function readActiveSellpiaShipmentTrackingAttempt(
  organizationId: string,
  environmentKey = getSellpiaShipmentTrackingEnvironmentKey(),
): ActiveSellpiaShipmentTrackingAttempt | null {
  if (!organizationId) return null;
  const raw = safeStorageGet(
    'local',
    sellpiaShipmentTrackingAttemptStorageKey(organizationId, environmentKey),
  );
  if (!raw) return null;
  try {
    const parsed = ActiveAttemptSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function rememberActiveSellpiaShipmentTrackingAttempt(
  organizationId: string,
  attempt: ActiveSellpiaShipmentTrackingAttempt,
  environmentKey = getSellpiaShipmentTrackingEnvironmentKey(),
): void {
  if (!organizationId) return;
  safeStorageSet(
    'local',
    sellpiaShipmentTrackingAttemptStorageKey(organizationId, environmentKey),
    JSON.stringify(attempt),
  );
}

export function newSellpiaShipmentTrackingIdempotencyKey(): string {
  return createSecureRandomUuid();
}

export function readSellpiaShipmentTrackingSourceAttempt(
  attemptId: string,
): Promise<SellpiaShipmentTrackingSourceAttempt> {
  return apiClient
    .getParsed(
      `${SELLPIA_SHIPMENT_TRACKING_SOURCE_PATH}/attempts/${encodeURIComponent(attemptId)}`,
      SellpiaShipmentTrackingSourceAttemptSchema,
    )
    .then((attempt) => {
      if (attempt.attemptId !== attemptId) {
        throw new Error('셀피아 송장 조회 시도 응답이 일치하지 않습니다.');
      }
      return attempt;
    });
}

export function beginSellpiaShipmentTrackingSourceAttempt(
  idempotencyKey: string,
  date: string,
): Promise<SellpiaShipmentTrackingSourceAttemptControl> {
  return apiClient
    .post<unknown>(
      `${SELLPIA_SHIPMENT_TRACKING_SOURCE_PATH}/attempts`,
      { startDate: date, endDate: date },
      { headers: { 'Idempotency-Key': idempotencyKey } },
    )
    .then((response) => SellpiaShipmentTrackingSourceAttemptControlSchema.parse(response));
}

export function readSellpiaShipmentTrackingSourceAttemptControl(
  attemptId: string,
): Promise<SellpiaShipmentTrackingSourceAttemptControl> {
  return apiClient
    .getParsed(
      `${SELLPIA_SHIPMENT_TRACKING_SOURCE_PATH}/attempts/${encodeURIComponent(attemptId)}/control`,
      SellpiaShipmentTrackingSourceAttemptControlSchema,
    );
}

export async function readSellpiaShipmentTrackingSource(
  attemptId: string,
): Promise<SellpiaShipmentTrackingSourcePayload> {
  const response = await apiClient.fetchRaw(
    `${SELLPIA_SHIPMENT_TRACKING_SOURCE_PATH}/attempts/${encodeURIComponent(attemptId)}/source`,
  );
  if (!response.ok) {
    throw new Error(`셀피아 송장 원본을 읽지 못했습니다 (${response.status}).`);
  }
  return SellpiaShipmentTrackingSourcePayloadSchema.parse(await response.json());
}

export async function failSellpiaShipmentTrackingSourceAttempt(
  attempt: Pick<SellpiaShipmentTrackingSourceAttemptControl, 'attemptId' | 'attemptToken'>,
  input: { errorCode: string; errorMessage: string },
): Promise<SellpiaShipmentTrackingSourceAttempt> {
  const response = await apiClient.post<unknown>(
    `${SELLPIA_SHIPMENT_TRACKING_SOURCE_PATH}/attempts/${encodeURIComponent(attempt.attemptId)}/fail`,
    input,
    { headers: { 'x-source-attempt-token': attempt.attemptToken } },
  );
  return SellpiaShipmentTrackingSourceAttemptSchema.parse(response);
}

export async function prepareSellpiaShipmentTrackingExtension(): Promise<string> {
  const runtime = await detectOrderCollectionExtensionRuntime(1_200, [
    SELLPIA_SHIPMENT_TRACKING_EXTENSION_CAPABILITY,
  ]);
  if (runtime.status === 'incompatible') {
    throw new Error('셀피아 송장 조회를 지원하는 익스텐션으로 새로고침해 주세요.');
  }
  if (runtime.status !== 'ready') {
    throw new Error('셀피아 송장 조회 익스텐션을 연결한 뒤 다시 시도해 주세요.');
  }
  return runtime.extensionId;
}

export async function startSellpiaShipmentTrackingBrowser(
  extensionId: string,
  attemptId: string,
): Promise<{ success?: boolean; attemptId?: string; terminalState?: string; error?: string }> {
  const response = await sendToExtension<{
    success?: boolean;
    attemptId?: string;
    terminalState?: string;
    error?: string;
  }>(
    extensionId,
    { action: 'collectSellpiaDeliTracking', attemptId },
    190_000,
  );
  if (response?.success === false) {
    throw new Error(response.error ?? '셀피아 송장 조회를 시작하지 못했습니다.');
  }
  return response;
}

export function isSellpiaShipmentTrackingAttemptNotFound(error: unknown): boolean {
  return isApiError(error) && error.status === 404;
}

export function sourcePayloadRows(
  payload: SellpiaShipmentTrackingSourcePayload,
): SellpiaTrackingRow[] {
  return payload.rows as SellpiaTrackingRow[];
}
