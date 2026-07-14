'use client';

import {
  BrowserCollectionCommandSchema,
  BrowserCollectionSessionViewSchema,
  type BrowserCollectionCommand,
  type BrowserCollectionProducer,
  type BrowserCollectionSessionView,
} from '@kiditem/shared/browser-collection-session';
import {
  detectBrowserCollectionExtensionIds,
  sendToExtension,
} from './extension-bridge';
import {
  requireAttentionOperationAlert,
  startOperationAlert,
  updateOperationAlert,
} from './operation-alerts';

type BrowserCollectionInputIdentity =
  BrowserCollectionSessionView['inputIdentity'];
export type BrowserCollectionControlAction = Exclude<
  BrowserCollectionCommand['action'],
  'listCollectionSessions' | 'getCollectionSession'
>;

const BROWSER_COLLECTION_TYPE = 'browser_collection';
const BROWSER_COLLECTION_SOURCE_TYPE = 'browser_collection_session';

export const browserCollectionOperationKey = (runId: string) =>
  `browser-collection:${runId}`;

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
    attempt: session.attempt,
    attentionReason: session.attention?.reason ?? null,
  };
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
): Promise<{ runId: string }> {
  const runId = globalThis.crypto.randomUUID();
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
    attempt: 1,
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
    if (!current || session.updatedAt > current.updatedAt) {
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
  return preferNewestSessions(sessions)[0] ?? null;
}
