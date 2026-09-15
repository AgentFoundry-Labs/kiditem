'use client';

import {
  BrowserCollectionCommandSchema,
  BrowserCollectionSessionViewSchema,
  type BrowserCollectionCommand,
  type BrowserCollectionSessionView,
} from '@kiditem/shared/browser-collection-session';
import type { QueryClient } from '@tanstack/react-query';
import {
  detectBrowserCollectionExtensionIds,
  sendToExtension,
} from './extension-bridge';
import { queryKeys } from './query-keys';

export type BrowserCollectionControlAction = Exclude<
  BrowserCollectionCommand['action'],
  'listCollectionSessions' | 'getCollectionSession'
>;

export function isBrowserCollectionSessionLocallyRunning(
  session: BrowserCollectionSessionView,
): boolean {
  return (
    session.attention === null &&
    (
      session.progress.total === 0 ||
      session.progress.completed + session.progress.failed < session.progress.total
    )
  );
}

export function preferBrowserCollectionSession(
  current: BrowserCollectionSessionView | null | undefined,
  candidate: BrowserCollectionSessionView | null,
): BrowserCollectionSessionView | null {
  return candidate ?? current ?? null;
}

export function updateBrowserCollectionSessionCache(
  queryClient: QueryClient,
  candidate: BrowserCollectionSessionView,
): boolean {
  queryClient.setQueryData<BrowserCollectionSessionView | null>(
    queryKeys.browserCollection.session(candidate.attemptId),
    candidate,
  );
  return true;
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
  const byAttemptId = new Map<string, BrowserCollectionSessionView>();
  for (const session of sessions) {
    byAttemptId.set(session.attemptId, session);
  }
  return [...byAttemptId.values()];
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
  attemptId: string,
): Promise<BrowserCollectionSessionView | null> {
  const command = BrowserCollectionCommandSchema.parse({
    action: 'getCollectionSession',
    attemptId,
  });
  const responses = await sendCommandToAllExtensions(command);
  const sessions = responses.flatMap((response) => {
    const parsed = parseSession(response);
    return parsed?.attemptId === attemptId ? [parsed] : [];
  });
  return preferNewestSessions(sessions)[0] ?? null;
}

/**
 * The session one extension holds for an attempt, or null when it holds none
 * or does not answer within the timeout.
 */
export async function readBrowserCollectionSession(
  extensionId: string,
  attemptId: string,
  timeoutMs: number,
): Promise<BrowserCollectionSessionView | null> {
  const command = BrowserCollectionCommandSchema.parse({
    action: 'getCollectionSession',
    attemptId,
  });
  try {
    const session = parseSession(await sendToExtension(extensionId, command, timeoutMs));
    return session?.attemptId === attemptId ? session : null;
  } catch {
    return null;
  }
}

export async function sendBrowserCollectionControl(
  attemptId: string,
  action: BrowserCollectionControlAction,
): Promise<BrowserCollectionSessionView | null> {
  const command = BrowserCollectionCommandSchema.parse({ action, attemptId });
  const responses = await sendCommandToAllExtensions(command);
  const sessions = responses.flatMap((response) => {
    const parsed = parseSession(response);
    return parsed?.attemptId === attemptId ? [parsed] : [];
  });
  const failure = responses.find(isExtensionFailure);
  if (failure && typeof failure.error === 'string') {
    throw new Error(failure.error);
  }

  return preferNewestSessions(sessions)[0] ?? await findBrowserCollectionSession(attemptId);
}
