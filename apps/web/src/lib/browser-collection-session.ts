'use client';

import {
  BrowserCollectionCommandSchema,
  BrowserCollectionRunIdSchema,
  BrowserCollectionSessionViewSchema,
  type BrowserCollectionCommand,
  type BrowserCollectionProducer,
  type BrowserCollectionSessionView,
} from '@kiditem/shared/browser-collection-session';
import type { QueryClient } from '@tanstack/react-query';
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

function progressRatio(
  progress: BrowserCollectionSessionView['progress'],
): number | null {
  if (progress.total === 0) return null;
  return Math.min(1, (progress.completed + progress.failed) / progress.total);
}

function alertMetadata(session: BrowserCollectionSessionView) {
  return {
    browserCollection: true,
    runId: session.runId,
    producer: session.producer,
    collectionAttempt: session.attempt,
    collectionUpdatedAt: session.updatedAt,
    attentionReason: session.attention?.reason ?? null,
  };
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
        message: session.progress.label,
        progress: 1,
        severity: 'info',
        metadata,
      });
    case 'failed':
      return updateOperationAlert(operationKey, {
        status: 'failed',
        message: session.progress.label,
        progress,
        severity: 'error',
        metadata,
      });
    case 'cancelled':
      return updateOperationAlert(operationKey, {
        status: 'cancelled',
        message: session.progress.label,
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
  const runId = existingRunId ?? globalThis.crypto.randomUUID();
  const now = Date.now();
  const message = '브라우저 수집 익스텐션을 찾을 수 없습니다.';
  const validated = BrowserCollectionSessionViewSchema.parse({
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
      message,
      canOpenTab: false,
    },
    startedAt: now,
    updatedAt: now,
    finishedAt: null,
  });
  const operationKey = browserCollectionOperationKey(runId);
  const metadata = {
    browserCollection: true,
    runId,
    producer,
    collectionAttempt: 1,
    collectionUpdatedAt: now,
    attentionReason: 'extension_missing',
    inputIdentity: validated.inputIdentity,
  };
  await startOperationAlert({
    operationKey,
    type: BROWSER_COLLECTION_TYPE,
    title: producer,
    sourceType: BROWSER_COLLECTION_SOURCE_TYPE,
    sourceId: producer,
    href: '/',
    metadata,
  });
  await requireAttentionOperationAlert(operationKey, {
    message,
    severity: 'warning',
    metadata,
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
