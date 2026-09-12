import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeStorageGet, safeStorageSet } from '@/lib/browser-storage';
import { createSecureRandomUuid } from '@/lib/secure-random-uuid';
import {
  getOrderCollectionEnvironmentKey,
  type OrderCollectionAttemptContext,
} from './order-collection-source-owner';

const PATH = '/api/orders/collection/coupang-directship/attempts';
const ACTIVE_STORAGE_PREFIX = 'kiditem:orders:coupang-directship-attempt';

const CoupangDirectCapturePlanSchema = z.object({
  sourceType: z.literal('coupang_direct_order_capture'),
  parserVersion: z.literal('coupang-direct-order-v1'),
  channelAccountId: z.string().uuid(),
  captureMode: z.literal('browser'),
  transportScope: z.literal('ALL'),
}).strict();

const CoupangDirectOwnerAttemptSchema = z.object({
  attemptId: z.string().uuid(),
  sourceImportRunId: z.string().uuid(),
  state: z.enum(['RUNNING', 'COMPLETE', 'FAILED']),
  plan: CoupangDirectCapturePlanSchema,
  expiresAt: z.string().datetime({ offset: true }).nullable(),
  artifactId: z.string().uuid().nullable(),
  contentChecksum: z.string().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
}).strict();

const CoupangDirectOrderItemSchema = z.object({
  skuId: z.string(),
  barcode: z.string(),
  name: z.string(),
  qty: z.number().int(),
  amount: z.number(),
}).strict();

const CoupangDirectPurchaseOrderSchema = z.object({
  seq: z.string(),
  status: z.enum(['PA', '발주확정']),
  center: z.string(),
  transport: z.enum(['SHIPMENT', 'MILKRUN']),
  edd: z.string(),
  reg: z.string(),
  urgent: z.boolean().optional(),
  items: z.array(CoupangDirectOrderItemSchema),
}).strict();

const CoupangDirectCenterSchema = z.object({
  addr: z.string().optional(),
  zip: z.union([z.string(), z.number().int()]).optional(),
  contact: z.string().optional(),
}).strict();

const CoupangDirectCaptureSchema = z.object({
  channelAccountId: z.string().uuid(),
  pos: z.array(CoupangDirectPurchaseOrderSchema).max(4_000),
  centers: z.record(z.string(), CoupangDirectCenterSchema),
}).strict();

const CoupangDirectOwnerCaptureSchema = z.object({
  attempt: CoupangDirectOwnerAttemptSchema,
  capture: CoupangDirectCaptureSchema,
}).strict();

export const CoupangDirectOwnerAttemptControlSchema =
  CoupangDirectOwnerAttemptSchema.extend({
    attemptToken: z.string().uuid(),
  }).strict();

export type CoupangDirectOwnerAttempt = z.infer<typeof CoupangDirectOwnerAttemptSchema>;
export type CoupangDirectOwnerAttemptControl = z.infer<
  typeof CoupangDirectOwnerAttemptControlSchema
>;
export type CoupangDirectOwnerCapture = z.infer<typeof CoupangDirectOwnerCaptureSchema>;

export type ActiveCoupangDirectAttempt = {
  attemptId: string | null;
  idempotencyKey: string | null;
  channelAccountId: string | null;
};

const ActiveCoupangDirectAttemptSchema = z.object({
  attemptId: z.string().uuid().nullable(),
  idempotencyKey: z.string().uuid().nullable(),
  channelAccountId: z.string().uuid().nullable(),
}).strict();

function activeStorageKey(
  organizationId: string,
  environmentKey = getOrderCollectionEnvironmentKey(),
): string {
  return [
    ACTIVE_STORAGE_PREFIX,
    encodeURIComponent(organizationId),
    encodeURIComponent(environmentKey),
  ].join(':');
}

export function readActiveCoupangDirectAttempt(
  organizationId: string,
  environmentKey = getOrderCollectionEnvironmentKey(),
): ActiveCoupangDirectAttempt | null {
  const raw = safeStorageGet('local', activeStorageKey(organizationId, environmentKey));
  if (!raw) return null;
  try {
    const parsed = ActiveCoupangDirectAttemptSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function rememberActiveCoupangDirectAttempt(
  organizationId: string,
  attempt: ActiveCoupangDirectAttempt,
  environmentKey = getOrderCollectionEnvironmentKey(),
): void {
  safeStorageSet(
    'local',
    activeStorageKey(organizationId, environmentKey),
    JSON.stringify(attempt),
  );
}

export function newCoupangDirectIdempotencyKey(): string {
  return createSecureRandomUuid();
}

export function beginCoupangDirectAttempt(
  idempotencyKey: string,
  channelAccountId: string,
): Promise<CoupangDirectOwnerAttemptControl> {
  return apiClient
    .post<unknown>(
      PATH,
      { channelAccountId },
      { headers: { 'Idempotency-Key': idempotencyKey } },
    )
    .then((response) => CoupangDirectOwnerAttemptControlSchema.parse(response));
}

export function readCoupangDirectAttempt(
  attemptId: string,
): Promise<CoupangDirectOwnerAttempt> {
  return apiClient
    .getParsed(
      `${PATH}/${encodeURIComponent(attemptId)}`,
      CoupangDirectOwnerAttemptSchema,
    );
}

export function readCoupangDirectAttemptControl(
  attemptId: string,
): Promise<CoupangDirectOwnerAttemptControl> {
  return apiClient
    .getParsed(
      `${PATH}/${encodeURIComponent(attemptId)}/control`,
      CoupangDirectOwnerAttemptControlSchema,
    );
}

export function readCoupangDirectCapture(
  attemptId: string,
): Promise<CoupangDirectOwnerCapture> {
  return apiClient.getParsed(
    `${PATH}/${encodeURIComponent(attemptId)}/capture`,
    CoupangDirectOwnerCaptureSchema,
  );
}

export function failCoupangDirectAttempt(
  run: OrderCollectionAttemptContext,
  input: { code: string; message: string },
): Promise<CoupangDirectOwnerAttempt> {
  return apiClient
    .post<unknown>(
      `${PATH}/${encodeURIComponent(run.attemptId)}/fail`,
      input,
      { headers: { 'x-source-attempt-token': run.attemptToken } },
    )
    .then((response) => CoupangDirectOwnerAttemptSchema.parse(response));
}

export function coupangDirectOwnerAttemptHeaders(
  run: OrderCollectionAttemptContext,
): Record<string, string> {
  return {
    'x-order-collection-attempt-id': run.attemptId,
    'x-source-attempt-token': run.attemptToken,
  };
}
