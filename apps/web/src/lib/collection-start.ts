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
import { isApiError } from './api-error';
import { transferExtensionAuthTo } from './extension-auth';
import { detectExtensionId, sendToExtension } from './extension-bridge';
import { createSecureRandomUuid } from './secure-random-uuid';

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
const HANGUL = /[가-힣]/;

/** A dispatch failure keeps the extension's `{ success: false, error }` shape. */
function dispatchFailureMessage(reply: unknown): string | null {
  if (typeof reply !== 'object' || reply === null) return null;
  const { success, error } = reply as { success?: unknown; error?: unknown };
  if (success !== false) return null;
  const message = typeof error === 'string' ? error.trim() : '';
  return HANGUL.test(message) ? message : START_REQUEST_FAILED;
}

/**
 * Starts a collection that shares the Coupang collection window. The
 * extension takes the window turn and opens the owner attempt; this page only
 * proposes the producer and scope and reads the decision.
 */
export async function startWindowCollection<TProducer extends CollectionStartProducer>(
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
  if (error.details.code !== 'ATTEMPT_IN_PROGRESS') return null;
  return { attemptId: error.details.attemptId ?? null };
}
