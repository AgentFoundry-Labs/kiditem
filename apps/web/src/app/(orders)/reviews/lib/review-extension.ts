// Orders-owned Coupang review source owner bridge.
// The server freezes the month plan, owns attempt state, and publishes only
// generation-tagged facts from COMPLETE attempts. The extension only crawls
// Wing and sends attempt-fenced chunks.

import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { createSecureRandomUuid } from '@/lib/secure-random-uuid';
import {
  detectExtensionId,
  isChromeExtensionRuntimeAvailable,
  sendToExtension,
} from '@/lib/extension-bridge';
import { KIDITEM_EXTENSION_MIN_VERSION } from '@/lib/extension-version';

export const REVIEW_EXTENSION_MIN_VERSION = KIDITEM_EXTENSION_MIN_VERSION;
export const REVIEW_EXTENSION_CHROME_REQUIRED =
  '쿠팡 리뷰 수집은 Chrome 확장프로그램으로 실행됩니다. Chrome에서 이 페이지를 열어주세요.';
export const REVIEW_EXTENSION_REQUIRED =
  'KIDITEM 쿠팡 확장프로그램을 설치/새로고침한 뒤 다시 실행하세요.';
export const REVIEW_EXTENSION_RELOAD_REQUIRED = `KIDITEM 쿠팡 확장프로그램이 예전 버전입니다. chrome://extensions 에서 확장프로그램을 새로고침한 뒤 다시 실행하세요. (필요 버전 ${REVIEW_EXTENSION_MIN_VERSION}+)`;

export const REVIEW_COLLECTION_MONTH_OPTIONS = [3, 6, 12, 24] as const;
export const DEFAULT_REVIEW_COLLECTION_MONTHS = 3;
const REVIEW_SOURCE_PATH = '/api/reviews';

export type ReviewExtensionGate =
  | { status: 'ready'; extensionId: string; version: string | null }
  | { status: 'chrome_required' }
  | { status: 'missing' }
  | { status: 'outdated'; extensionId: string; version: string | null };

interface ExtensionPingResponse {
  success?: boolean;
  version?: string;
  capabilities?: { coupangReviewCollection?: boolean };
}

const ReviewCollectionPlanSchema = z.object({
  sourceType: z.literal('coupang_reviews'),
  parserVersion: z.literal('coupang-review-v1'),
  months: z.number().int().min(1).max(36),
  windows: z.array(z.object({
    index: z.number().int().nonnegative(),
    label: z.string().regex(/^\d{4}-\d{2}$/),
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).strict()).min(1),
  pageSize: z.literal(50),
  maxPagesPerWindow: z.literal(40),
}).strict();

const ReviewCollectionAttemptSchema = z.object({
  attemptId: z.string().uuid(),
  sourceImportRunId: z.string().uuid(),
  state: z.enum(['RUNNING', 'COMPLETE', 'FAILED']),
  plan: ReviewCollectionPlanSchema,
  expiresAt: z.string().datetime({ offset: true }).nullable(),
  completedWindows: z.array(z.number().int().nonnegative()),
  collected: z.number().int().nonnegative(),
  created: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  linked: z.number().int().nonnegative(),
  unlinked: z.number().int().nonnegative(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
}).strict();

const ReviewCollectionAttemptControlSchema = ReviewCollectionAttemptSchema.extend({
  attemptToken: z.string().uuid(),
}).strict();

type ReviewCollectionAttempt = z.infer<typeof ReviewCollectionAttemptSchema>;
type ReviewCollectionAttemptControl = z.infer<typeof ReviewCollectionAttemptControlSchema>;

export interface ReviewCollectionStatus {
  status: 'idle' | 'running' | 'done' | 'error' | 'cancelled' | string;
  runId?: string | null;
  attemptToken?: string | null;
  months?: number;
  total?: number;
  completed?: number;
  collected?: number;
  created?: number;
  updated?: number;
  linked?: number;
  unlinked?: number;
  current?: string | null;
  failures?: Array<{ month: string; error: string }>;
  error?: string | null;
  cancelRequested?: boolean;
  startedAt?: number;
  endedAt?: number | null;
}

export interface StartReviewCollectionResponse extends ReviewCollectionStatus {
  success?: boolean;
  started?: boolean;
}

export function isReviewExtensionVersionAtLeast(
  current: string | null | undefined,
  minimum: string,
): boolean {
  if (!current) return false;
  const currentParts = current.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const minimumParts = minimum.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const maxLength = Math.max(currentParts.length, minimumParts.length);
  for (let index = 0; index < maxLength; index += 1) {
    const currentValue = currentParts[index] ?? 0;
    const minimumValue = minimumParts[index] ?? 0;
    if (currentValue > minimumValue) return true;
    if (currentValue < minimumValue) return false;
  }
  return true;
}

export async function detectReviewExtensionGate(): Promise<ReviewExtensionGate> {
  if (!isChromeExtensionRuntimeAvailable()) return { status: 'chrome_required' };
  const extensionId = await detectExtensionId();
  if (!extensionId) return { status: 'missing' };
  const ping = await sendToExtension<ExtensionPingResponse>(extensionId, { action: 'ping' }).catch(() => null);
  if (!ping?.success) return { status: 'missing' };
  const version = typeof ping.version === 'string' ? ping.version : null;
  if (
    !ping.capabilities?.coupangReviewCollection ||
    !isReviewExtensionVersionAtLeast(version, REVIEW_EXTENSION_MIN_VERSION)
  ) {
    return { status: 'outdated', extensionId, version };
  }
  return { status: 'ready', extensionId, version };
}

export function reviewExtensionGateMessage(gate: ReviewExtensionGate): string | null {
  if (gate.status === 'chrome_required') return REVIEW_EXTENSION_CHROME_REQUIRED;
  if (gate.status === 'missing') return REVIEW_EXTENSION_REQUIRED;
  if (gate.status === 'outdated') return REVIEW_EXTENSION_RELOAD_REQUIRED;
  return null;
}

/** Begin the server-owned attempt, then hand its frozen permit to the extension. */
export async function runCoupangReviewCollection(
  extensionId: string,
  months: number,
  idempotencyKey = createSecureRandomUuid(),
): Promise<StartReviewCollectionResponse> {
  const raw = await apiClient.post<unknown>(
    `${REVIEW_SOURCE_PATH}/attempts`,
    { months },
    { headers: { 'Idempotency-Key': idempotencyKey } },
  );
  const control = ReviewCollectionAttemptControlSchema.parse(raw);
  if (control.state !== 'RUNNING') {
    // An idempotency replay of a terminal owner attempt is a read. Do not
    // reopen a Wing tab or ask the extension to upload against a terminal
    // fence after a lost response.
    return { ...toStatus(control), success: true, started: false };
  }
  const response = await sendToExtension<StartReviewCollectionResponse>(extensionId, {
    action: 'runCoupangReviewCollection',
    attemptId: control.attemptId,
    attemptToken: control.attemptToken,
    plan: control.plan,
  });
  if (!response?.success) {
    throw new Error(response?.error ?? '쿠팡 리뷰 수집 시작 실패');
  }
  return { ...toStatus(control), success: true, started: true };
}

export async function getCoupangReviewCollectionStatus(
  _extensionId: string,
  runId?: string | null,
): Promise<ReviewCollectionStatus> {
  if (!runId) return { status: 'idle' };
  const raw = await apiClient.get<unknown>(
    `${REVIEW_SOURCE_PATH}/attempts/${encodeURIComponent(runId)}`,
  );
  return toStatus(ReviewCollectionAttemptSchema.parse(raw));
}

/** Read the extension's token-free local checkpoint after a page/worker restart. */
export async function getCoupangReviewCollectionExtensionStatus(
  extensionId: string,
): Promise<ReviewCollectionStatus> {
  const response = await sendToExtension<unknown>(extensionId, {
    action: 'getCoupangReviewCollectionStatus',
  });
  if (!response || typeof response !== 'object' || typeof (response as { status?: unknown }).status !== 'string') {
    return { status: 'idle' };
  }
  return response as ReviewCollectionStatus;
}

/**
 * Reconcile a token-free extension checkpoint with the server owner. This only
 * reads state; it never re-dispatches provider work after a restart.
 */
export async function recoverCoupangReviewCollection(
  extensionId: string,
): Promise<ReviewCollectionStatus> {
  const local = await getCoupangReviewCollectionExtensionStatus(extensionId);
  if (!local.runId || local.status === 'idle') return local;
  try {
    const owner = await getCoupangReviewCollectionStatus(extensionId, local.runId);
    return owner.status === 'running'
      ? { ...owner, cancelRequested: owner.cancelRequested || local.cancelRequested }
      : owner;
  } catch {
    // The token-free local checkpoint is still useful to render a pending stop
    // while auth/API access is restored. It is never sufficient to resume.
    return local;
  }
}

export async function cancelCoupangReviewCollection(
  extensionId: string,
  runId?: string | null,
  attemptToken?: string | null,
): Promise<void> {
  // Dispatch the extension-local fence before starting any owner HTTP work.
  // The extension sets its in-memory stop bit synchronously on receipt, so a
  // slow storage/control request cannot let provider work continue.
  let extensionFailure: unknown = null;
  let extensionFence: Promise<unknown>;
  try {
    extensionFence = Promise.resolve(sendToExtension(extensionId, {
      action: 'cancelCoupangReviewCollection',
      ...(runId ? { runId } : {}),
    })).catch((error) => {
      extensionFailure = error;
      return null;
    });
  } catch (error) {
    extensionFailure = error;
    extensionFence = Promise.resolve(null);
  }

  let ownerFailure: unknown = null;
  const ownerCancellation = (async () => {
    if (!runId) return;
    try {
      let token = attemptToken;
      if (!token) {
        // A page restart loses the in-memory token. Resolve it through the
        // organization-scoped owner control endpoint and keep it only in this
        // function call; extension storage and UI state remain token-free.
        const raw = await apiClient.get<unknown>(
          `${REVIEW_SOURCE_PATH}/attempts/${encodeURIComponent(runId)}/control`,
        );
        const control = ReviewCollectionAttemptControlSchema.parse(raw);
        if (control.attemptId !== runId) {
          throw new Error('리뷰 수집 허가 응답이 현재 실행과 일치하지 않습니다');
        }
        token = control.attemptToken;
      }
      await apiClient.post(
        `${REVIEW_SOURCE_PATH}/attempts/${encodeURIComponent(runId)}/cancel`,
        undefined,
        { headers: { 'x-source-attempt-token': token } },
      );
    } catch (error) {
      ownerFailure = error;
    }
  })();

  await Promise.all([extensionFence, ownerCancellation]);
  if (ownerFailure || extensionFailure) throw ownerFailure || extensionFailure;
}

function toStatus(attempt: ReviewCollectionAttempt | ReviewCollectionAttemptControl): ReviewCollectionStatus {
  const cancelled = attempt.errorCode === 'USER_CANCELLED';
  return {
    status: cancelled ? 'cancelled' : attempt.state === 'RUNNING' ? 'running' : attempt.state === 'COMPLETE' ? 'done' : 'error',
    runId: attempt.attemptId,
    attemptToken: 'attemptToken' in attempt ? attempt.attemptToken : null,
    months: attempt.plan.months,
    total: attempt.plan.windows.length,
    completed: attempt.completedWindows.length,
    collected: attempt.collected,
    created: attempt.created,
    updated: attempt.updated,
    linked: attempt.linked,
    unlinked: attempt.unlinked,
    current: null,
    failures: attempt.errorMessage ? [{ month: '', error: attempt.errorMessage }] : [],
    error: attempt.errorMessage,
    cancelRequested: false,
    endedAt: attempt.state === 'RUNNING' ? null : Date.now(),
  };
}
