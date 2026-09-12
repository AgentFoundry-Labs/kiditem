'use client';

import {
  BrowserCollectionCommandSchema,
  BrowserCollectionRunIdSchema,
  BrowserCollectionRunIssueResponseSchema,
  BrowserCollectionSessionViewSchema,
  type BrowserCollectionCommand,
  type BrowserCollectionProducer,
  type BrowserCollectionSessionView,
} from '@kiditem/shared/browser-collection-session';
import type { QueryClient } from '@tanstack/react-query';
import { apiClient } from './api-client';
import {
  detectBrowserCollectionExtensionIds,
  sendToExtension,
} from './extension-bridge';
import {
  requireAttentionOperationAlert,
  startOperationAlert,
  updateOperationAlert,
} from './operation-alerts';
import { queryKeys } from './query-keys';

type BrowserCollectionInputIdentity =
  BrowserCollectionSessionView['inputIdentity'];
export type BrowserCollectionControlAction = Exclude<
  BrowserCollectionCommand['action'],
  'listCollectionSessions' | 'getCollectionSession' | 'finalizeCollectionSession'
>;

const BROWSER_COLLECTION_TYPE = 'browser_collection';
const BROWSER_COLLECTION_SOURCE_TYPE = 'browser_collection_session';

export const browserCollectionOperationKey = (runId: string) =>
  `browser-collection:${runId}`;

export async function issueBrowserCollectionRunId(
  existingRunId?: string | null,
): Promise<string> {
  if (existingRunId) return BrowserCollectionRunIdSchema.parse(existingRunId);
  const response = await apiClient.post<unknown>('/api/browser-collection-runs', {});
  return BrowserCollectionRunIssueResponseSchema.parse(response).runId;
}

export function browserCollectionRunIdFromOperationKey(
  operationKey: string | null | undefined,
): string | null {
  const prefix = 'browser-collection:';
  if (!operationKey?.startsWith(prefix)) return null;
  const parsed = BrowserCollectionRunIdSchema.safeParse(
    operationKey.slice(prefix.length),
  );
  return parsed.success ? parsed.data : null;
}

/** 확장은 수집 세션을 7일만 둔다 (`extensions/shared/collection-session.js` 의 RETENTION_MS). */
export const BROWSER_COLLECTION_SESSION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

const EXPIRED_COLLECTION_MESSAGE =
  '7일 넘게 멈춰 있던 수집이라 정리했습니다. 확장에 이 수집 기록이 더 이상 없습니다.';

type BrowserCollectionAlertLike = {
  /** 알림 id. 있으면 닫은 뒤 읽음으로 둬 전역 알림판 배지에서도 뺀다. */
  id?: string;
  status: string;
  operationKey: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

function lastCollectionUpdate(alert: BrowserCollectionAlertLike): number {
  const updatedAt = alert.metadata.collectionUpdatedAt;
  return typeof updatedAt === 'number' && Number.isFinite(updatedAt)
    ? updatedAt
    : Date.parse(alert.createdAt);
}

/**
 * 어느 브라우저에도 세션이 남아 있을 수 없는, 멈춘 수집 알림인가.
 *
 * 확장은 7일 지난 세션을 지운다. 마지막 갱신이 그보다 오래된 running·pending 수집 알림은
 * 다시 움직일 길이 없다 — '작업 중단'도 확장에 세션이 없어 실패한다. 다른 브라우저에 아직
 * 살아 있을 수 있는 7일 안의 알림은 여기에 들지 않는다.
 */
export function isExpiredBrowserCollectionAlert(
  alert: BrowserCollectionAlertLike,
  now: number = Date.now(),
): boolean {
  if (alert.status !== 'pending' && alert.status !== 'running') return false;
  if (!browserCollectionRunIdFromOperationKey(alert.operationKey)) return false;
  const updatedAt = lastCollectionUpdate(alert);
  return Number.isFinite(updatedAt) && now - updatedAt > BROWSER_COLLECTION_SESSION_RETENTION_MS;
}

/**
 * 그런 알림을 '취소'로 닫고 읽음으로 둔다. 브라우저 수집 알림의 수명주기는 웹이 가지므로
 * 같은 PATCH 경로로, 순서 메타데이터를 새로 붙여 닫는다. 다른 사람이 연 알림(404)은
 * 건너뛴다. 주문·몰 데이터는 건드리지 않는다.
 */
export async function closeExpiredBrowserCollectionAlerts(
  alerts: readonly BrowserCollectionAlertLike[],
  now: number = Date.now(),
): Promise<{ closed: string[]; skipped: number; failed: number }> {
  const closed: string[] = [];
  let skipped = 0;
  let failed = 0;
  for (const alert of alerts) {
    if (!alert.operationKey || !isExpiredBrowserCollectionAlert(alert, now)) continue;
    const attempt = alert.metadata.collectionAttempt;
    try {
      const updated = await updateOperationAlert(alert.operationKey, {
        status: 'cancelled',
        message: EXPIRED_COLLECTION_MESSAGE,
        severity: 'info',
        metadata: {
          browserCollection: true,
          collectionAttempt:
            typeof attempt === 'number' && Number.isInteger(attempt) && attempt >= 1 ? attempt : 1,
          collectionUpdatedAt: now,
          staleReconciled: true,
          staleReconciledReason: 'browser_session_expired',
        },
      });
      if (!updated) {
        skipped += 1;
        continue;
      }
      closed.push(alert.operationKey);
      if (alert.id) {
        // 읽음으로 둬야 전역 알림판 배지에서도 빠진다. 실패해도 닫힌 것은 닫힌 것이다.
        try {
          await apiClient.post(`/api/alerts/${encodeURIComponent(alert.id)}/dismiss`);
        } catch {
          // 읽음 처리만 못 했다 — 다음에 정리할 때 다시 시도된다.
        }
      }
    } catch {
      failed += 1;
    }
  }
  return { closed, skipped, failed };
}

function progressRatio(
  progress: BrowserCollectionSessionView['progress'],
): number | null {
  if (progress.total === 0) return null;
  return Math.min(1, (progress.completed + progress.failed) / progress.total);
}

function alertMetadata(session: BrowserCollectionSessionView) {
  // 몰 주문수집 알림은 몰마다 제목이 '주문 데이터 수집' 으로 같다. 어느 몰 일인지는 세션
  // inputIdentity 의 mallKey 뿐이라 알림에도 남긴다 — 쇼핑몰 홈이 몰별로 알림을 모은다.
  const mallKey = session.inputIdentity.mallKey;
  return {
    browserCollection: true,
    runId: session.runId,
    producer: session.producer,
    collectionAttempt: session.attempt,
    collectionUpdatedAt: session.updatedAt,
    attentionReason: session.attention?.reason ?? null,
    mallKey: typeof mallKey === 'string' && mallKey.length > 0 ? mallKey : null,
  };
}

function terminalMessage(session: BrowserCollectionSessionView): string | null {
  if (
    session.producer === 'inventory.sellpia'
    && session.status === 'succeeded'
  ) {
    return 'Sellpia 현재고 동기화가 완료되었습니다.';
  }
  return session.progress.label;
}

type BrowserCollectionOrdering = Pick<
  BrowserCollectionSessionView,
  'attempt' | 'updatedAt'
>;

export function isBrowserCollectionOrderingNewer(
  candidate: BrowserCollectionOrdering,
  current: BrowserCollectionOrdering | null | undefined,
): boolean {
  if (!current) return true;
  if (candidate.attempt !== current.attempt) {
    return candidate.attempt > current.attempt;
  }
  return candidate.updatedAt > current.updatedAt;
}

export function preferBrowserCollectionSession(
  current: BrowserCollectionSessionView | null | undefined,
  candidate: BrowserCollectionSessionView | null,
): BrowserCollectionSessionView | null {
  if (!candidate) return current ?? null;
  return isBrowserCollectionOrderingNewer(candidate, current)
    ? candidate
    : (current ?? candidate);
}

export function updateBrowserCollectionSessionCache(
  queryClient: QueryClient,
  candidate: BrowserCollectionSessionView,
): boolean {
  let updated = false;
  queryClient.setQueryData<BrowserCollectionSessionView | null>(
    queryKeys.browserCollection.session(candidate.runId),
    (current) => {
      if (!isBrowserCollectionOrderingNewer(candidate, current)) return current;
      updated = true;
      return candidate;
    },
  );
  return updated;
}

function startInput(
  session: BrowserCollectionSessionView,
  metadata: ReturnType<typeof alertMetadata>,
) {
  return {
    operationKey: browserCollectionOperationKey(session.runId),
    type: BROWSER_COLLECTION_TYPE,
    title: session.producer,
    sourceType: BROWSER_COLLECTION_SOURCE_TYPE,
    sourceId: session.producer,
    href: '/',
    metadata,
  };
}

async function updateForSession(
  operationKey: string,
  session: BrowserCollectionSessionView,
  metadata: ReturnType<typeof alertMetadata>,
) {
  const progress = progressRatio(session.progress);
  switch (session.status) {
    case 'attention_required':
      return requireAttentionOperationAlert(operationKey, {
        message: session.attention?.message ?? null,
        progress,
        severity: 'warning',
        metadata,
      });
    case 'succeeded':
      return updateOperationAlert(operationKey, {
        status: 'succeeded',
        message: terminalMessage(session),
        progress: 1,
        severity: 'info',
        metadata,
      });
    case 'failed':
      return updateOperationAlert(operationKey, {
        status: 'failed',
        message: terminalMessage(session),
        progress,
        severity: 'error',
        metadata,
      });
    case 'cancelled':
      return updateOperationAlert(operationKey, {
        status: 'cancelled',
        message: terminalMessage(session),
        progress,
        severity: 'info',
        metadata,
      });
    default:
      return null;
  }
}

export async function syncBrowserCollectionAlert(
  session: BrowserCollectionSessionView,
): Promise<void> {
  const parsed = BrowserCollectionSessionViewSchema.parse(session);
  if (parsed.status === 'idle') return;

  const operationKey = browserCollectionOperationKey(parsed.runId);
  const metadata = alertMetadata(parsed);
  if (parsed.status === 'running') {
    await startOperationAlert({
      ...startInput(parsed, metadata),
      progress: progressRatio(parsed.progress),
    });
    return;
  }

  const updated = await updateForSession(operationKey, parsed, metadata);
  if (updated) return;

  await startOperationAlert(startInput(parsed, metadata));
  await updateForSession(operationKey, parsed, metadata);
}

export async function recordMissingBrowserCollection(
  producer: BrowserCollectionProducer,
  inputIdentity: BrowserCollectionInputIdentity,
  existingRunId?: string,
): Promise<{ runId: string }> {
  const runId = await issueBrowserCollectionRunId(existingRunId);
  const now = Date.now();
  BrowserCollectionSessionViewSchema.parse({
    runId,
    producer,
    classification: 'background_safe',
    status: 'attention_required',
    attempt: 1,
    restartStrategy: 'web',
    progress: {
      current: 0,
      total: 0,
      completed: 0,
      failed: 0,
      label: null,
    },
    inputIdentity,
    attention: {
      reason: 'extension_missing',
      message: '브라우저 수집 익스텐션을 찾을 수 없습니다.',
      canOpenTab: false,
    },
    startedAt: now,
    updatedAt: now,
    finishedAt: null,
  });
  return { runId };
}

function parseSession(value: unknown): BrowserCollectionSessionView | null {
  const parsed = BrowserCollectionSessionViewSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function isExtensionFailure(
  value: unknown,
): value is { success: false; error?: unknown } {
  return typeof value === 'object' &&
    value !== null &&
    'success' in value &&
    value.success === false;
}

async function sendCommandToAllExtensions(
  command: BrowserCollectionCommand,
): Promise<unknown[]> {
  const parsedCommand = BrowserCollectionCommandSchema.parse(command);
  const extensionIds = await detectBrowserCollectionExtensionIds();
  const results = await Promise.allSettled(
    extensionIds.map((extensionId) =>
      sendToExtension(extensionId, parsedCommand),
    ),
  );
  return results.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : [],
  );
}

function preferNewestSessions(
  sessions: BrowserCollectionSessionView[],
): BrowserCollectionSessionView[] {
  const byRunId = new Map<string, BrowserCollectionSessionView>();
  for (const session of sessions) {
    const current = byRunId.get(session.runId);
    if (isBrowserCollectionOrderingNewer(session, current)) {
      byRunId.set(session.runId, session);
    }
  }
  return [...byRunId.values()];
}

export async function listBrowserCollectionSessions(): Promise<
  BrowserCollectionSessionView[]
> {
  const responses = await sendCommandToAllExtensions({
    action: 'listCollectionSessions',
  });
  const sessions = responses.flatMap((response) =>
    Array.isArray(response)
      ? response.flatMap((value) => {
          const parsed = parseSession(value);
          return parsed ? [parsed] : [];
        })
      : [],
  );
  return preferNewestSessions(sessions);
}

export async function findBrowserCollectionSession(
  runId: string,
): Promise<BrowserCollectionSessionView | null> {
  const command = BrowserCollectionCommandSchema.parse({
    action: 'getCollectionSession',
    runId,
  });
  const responses = await sendCommandToAllExtensions(command);
  const sessions = responses.flatMap((response) => {
    const parsed = parseSession(response);
    return parsed?.runId === runId ? [parsed] : [];
  });
  return preferNewestSessions(sessions)[0] ?? null;
}

export async function sendBrowserCollectionControl(
  runId: string,
  action: BrowserCollectionControlAction,
): Promise<BrowserCollectionSessionView | null> {
  const command = BrowserCollectionCommandSchema.parse({ action, runId });
  const responses = await sendCommandToAllExtensions(command);
  const sessions = responses.flatMap((response) => {
    const parsed = parseSession(response);
    return parsed?.runId === runId ? [parsed] : [];
  });
  const failure = responses.find(isExtensionFailure);
  if (failure && typeof failure.error === 'string') {
    throw new Error(failure.error);
  }

  let current: BrowserCollectionSessionView | null =
    preferNewestSessions(sessions)[0] ?? null;
  if (!current) current = await findBrowserCollectionSession(runId);
  if (action !== 'cancelCollectionSession' || current?.status === 'cancelled') {
    return current;
  }

  for (let attempt = 0; attempt < 12; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    current = preferBrowserCollectionSession(
      current,
      await findBrowserCollectionSession(runId),
    );
    if (current?.status === 'cancelled') return current;
  }
  throw new Error(
    '브라우저 수집 중단 상태를 확인하지 못했습니다. 확장프로그램을 새로고침한 뒤 다시 시도해주세요.',
  );
}
