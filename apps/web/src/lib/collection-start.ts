'use client';

import {
  COLLECTION_START_ACTION,
  COLLECTION_START_CAPABILITY,
  CollectionStartRequestSchema,
  CollectionStartResultSchema,
  type CollectionStartProducer,
  type CollectionStartRequest,
  type CollectionStartResult,
} from '@kiditem/shared/collection-start';
import type { CollectionStartOutcome } from '@/hooks/use-collection-source-control';
import { isApiError } from './api-error';
import { readBrowserCollectionSession } from './browser-collection-session';
import { transferExtensionAuthTo } from './extension-auth';
import { detectExtensionId, sendToExtension } from './extension-bridge';
import { createSecureRandomUuid } from './secure-random-uuid';
import { operatorReason } from './operator-error';

export type CollectionStartScope<TProducer extends CollectionStartProducer> = Extract<
  CollectionStartRequest,
  { producer: TProducer }
>['scope'];

// The extension answers once the start is decided, right after the attempt
// opens; the collection itself runs on without holding this channel.
const START_REPLY_TIMEOUT_MS = 60_000;
const EXTENSION_MISSING = '브라우저 수집 익스텐션을 찾을 수 없습니다.';
const START_REQUEST_FAILED = '확장 프로그램이 수집 시작 요청을 처리하지 못했습니다.';
export const COLLECTION_START_UPDATE_REQUIRED = '확장 프로그램을 업데이트해 주세요.';
// A web-opened start waits this long for the extension to take the attempt.
const HANDOFF_DEADLINE_MS = 20_000;
const HANDOFF_POLL_MS = 500;
const HANDOFF_SESSION_READ_TIMEOUT_MS = 2_000;
// An extension run answers only when its collection ends; the handoff stops
// waiting on that answer once the extension shows the attempt's session.
const EXTENSION_RUN_REPLY_TIMEOUT_MS = 190_000;
const HANDOFF_REFUSED = '확장 프로그램이 수집을 넘겨받지 못했습니다. 확장 상태를 확인한 뒤 다시 시작해 주세요.';
const HANDOFF_UNANSWERED = '확장 프로그램이 수집을 넘겨받지 않았습니다. 확장 상태를 확인한 뒤 다시 시작해 주세요.';
const HANDOFF_OTHER_RUN = '확장 프로그램이 다른 수집을 처리하느라 이 수집을 넘겨받지 못했습니다. 잠시 후 다시 시작해 주세요.';

function koreanReason(message: unknown, fallback: string): string {
  return operatorReason(message, fallback);
}

/** A dispatch failure keeps the extension's `{ success: false, error }` shape. */
function dispatchFailureMessage(reply: unknown): string | null {
  if (typeof reply !== 'object' || reply === null) return null;
  const { success, error } = reply as { success?: unknown; error?: unknown };
  if (success !== false) return null;
  return koreanReason(error, START_REQUEST_FAILED);
}

/**
 * Asks the extension to start a collection through the start contract: one
 * that takes turns in the Coupang collection window. The Wing catalog is an
 * operation kind (`lib/operation-start.ts`, KID-354). The extension
 * takes that turn and opens the owner attempt; this page only proposes the
 * producer and scope and reads the decision.
 */
export async function requestCollectionStart<TProducer extends CollectionStartProducer>(
  producer: TProducer,
  scope: CollectionStartScope<TProducer>,
): Promise<CollectionStartResult> {
  const request = CollectionStartRequestSchema.parse({
    action: COLLECTION_START_ACTION,
    producer,
    idempotencyKey: createSecureRandomUuid(),
    scope,
  });
  const extensionId = await detectExtensionId();
  if (!extensionId) throw new Error(EXTENSION_MISSING);
  const ping = await sendToExtension<{
    success?: boolean;
    capabilities?: Record<string, unknown>;
  }>(extensionId, { action: 'ping' });
  if (ping?.success !== true || ping.capabilities?.[COLLECTION_START_CAPABILITY] !== true) {
    throw new Error(COLLECTION_START_UPDATE_REQUIRED);
  }
  await transferExtensionAuthTo(extensionId);
  const reply = await sendToExtension(extensionId, request, START_REPLY_TIMEOUT_MS);
  const failure = dispatchFailureMessage(reply);
  if (failure) throw new Error(failure);
  const result = CollectionStartResultSchema.safeParse(reply);
  // An answer outside the contract, or for another producer, is an extension
  // that does not speak this start yet.
  if (!result.success || result.data.producer !== producer) {
    throw new Error(COLLECTION_START_UPDATE_REQUIRED);
  }
  return result.data;
}

/**
 * A source owner's 409 for a live attempt of the same source. The owner names
 * the attempt when its error body carries one; any other failure is not this.
 */
export function attemptInProgress(error: unknown): Readonly<{ attemptId: string | null }> | null {
  if (!isApiError(error) || error.status !== 409) return null;
  if (error.code !== 'ATTEMPT_IN_PROGRESS') return null;
  return { attemptId: error.details.attemptId ?? null };
}

/** What the owner opened for a web-opened start, or the owner's refusal. */
export type WebOpenedAttempt =
  | Readonly<{ outcome: 'opened'; attemptId: string; running: boolean }>
  | Readonly<{ outcome: 'refused'; message: string }>;

/**
 * The opened attempt as the extension receives it. A batch owner names its
 * batch by the start's idempotency key rather than by one attempt.
 */
export type WebOpenedHandoff = Readonly<{
  extensionId: string;
  attemptId: string;
  idempotencyKey: string;
}>;

export type WebOpenedCollection = Readonly<{
  /** Finds the extension that runs the collection; rejects with the Korean reason none can. */
  detectExtension: () => Promise<string>;
  /** Opens the owner attempt under the start's idempotency key. */
  begin: (idempotencyKey: string) => Promise<WebOpenedAttempt>;
  /** Resolves once the extension took the attempt; rejects when it did not. */
  handOff: (handoff: WebOpenedHandoff) => Promise<void>;
  /** The owner's operator stop, for an attempt the extension did not take. */
  cancel: (handoff: WebOpenedHandoff) => Promise<unknown>;
}>;

/**
 * Starts a collection whose owner attempt the page opens itself: find the
 * extension, hand it auth, open the attempt (or read the owner's running one),
 * then hand the attempt to the extension. An attempt the extension does not
 * take is stopped through the owner, so the source never shows a collection
 * nobody runs, and the start rejects with the reason.
 */
export async function startWebOpenedCollection(
  collection: WebOpenedCollection,
): Promise<CollectionStartOutcome> {
  const extensionId = await collection.detectExtension();
  await transferExtensionAuthTo(extensionId);
  const idempotencyKey = createSecureRandomUuid();
  let opened: WebOpenedAttempt;
  try {
    opened = await collection.begin(idempotencyKey);
  } catch (error) {
    const inProgress = attemptInProgress(error);
    if (!inProgress) throw error;
    return { outcome: 'running', attemptId: inProgress.attemptId };
  }
  if (opened.outcome === 'refused') return opened;
  // A replayed attempt that already ended leaves nothing to hand off.
  if (!opened.running) return { outcome: 'started', attemptId: opened.attemptId };
  const handoff: WebOpenedHandoff = { extensionId, attemptId: opened.attemptId, idempotencyKey };
  try {
    await collection.handOff(handoff);
  } catch (error) {
    await collection.cancel(handoff).catch(() => undefined);
    throw new Error(koreanReason(error instanceof Error ? error.message : null, HANDOFF_REFUSED));
  }
  return { outcome: 'started', attemptId: opened.attemptId };
}

type RunAnswer = Readonly<{ taken: boolean; reason: string }>;

function runAnswer(reply: unknown, attemptId: string): RunAnswer {
  const { success, terminalState, error, attemptId: answeredAttemptId } = (
    typeof reply === 'object' && reply !== null ? reply : {}
  ) as { success?: unknown; terminalState?: unknown; error?: unknown; attemptId?: unknown };
  // An answer that names another attempt came from another run, such as an
  // older one still active in this browser, and says nothing about this one.
  if (typeof answeredAttemptId === 'string' && answeredAttemptId !== attemptId) {
    return { taken: false, reason: HANDOFF_OTHER_RUN };
  }
  // A finished run, or an attempt the owner already ended, needs nothing more
  // from the page; any other answer came before the extension took the attempt.
  return {
    taken: success === true || terminalState === 'COMPLETE' || terminalState === 'FAILED',
    reason: koreanReason(error, HANDOFF_REFUSED),
  };
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Hands an attempt to an extension run that answers only when its collection
 * ends. The extension took the attempt once it shows the attempt's session, even
 * when it already answered without finishing (a login it waits on, say). Any
 * other answer is a refusal unless the attempt already ended, an answer that
 * names another attempt is always one, and no sign within the deadline is a
 * refusal too.
 */
export async function handOffToExtensionRun(
  extensionId: string,
  attemptId: string,
  message: Readonly<{ action: string } & Record<string, unknown>>,
): Promise<void> {
  const state: { answer: RunAnswer | null } = { answer: null };
  const answered = sendToExtension<unknown>(extensionId, message, EXTENSION_RUN_REPLY_TIMEOUT_MS).then(
    (reply) => {
      state.answer = runAnswer(reply, attemptId);
    },
    (error: unknown) => {
      state.answer = {
        taken: false,
        reason: koreanReason(error instanceof Error ? error.message : null, HANDOFF_REFUSED),
      };
    },
  );
  const deadline = Date.now() + HANDOFF_DEADLINE_MS;
  for (;;) {
    const { answer } = state;
    if (answer?.taken) return;
    if (await readBrowserCollectionSession(extensionId, attemptId, HANDOFF_SESSION_READ_TIMEOUT_MS)) {
      return;
    }
    if (answer) throw new Error(answer.reason);
    if (Date.now() >= deadline) throw new Error(HANDOFF_UNANSWERED);
    await Promise.race([answered, wait(HANDOFF_POLL_MS)]);
  }
}
