'use client';

import {
  AdTrafficSourceAttemptSchema,
  AdTrafficSourceBeginSchema,
  AdTrafficSourceStatusSchema,
  type AdTrafficSourceAttempt,
  type AdTrafficSourceBegin,
} from '@kiditem/shared/advertising';
import { apiClient } from '@/lib/api-client';
import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { transferExtensionAuthTo } from '@/lib/extension-auth';
import { createSecureRandomUuid } from '@/lib/secure-random-uuid';

const SOURCE_PATH = '/api/ads/traffic';
const EXTENSION_ACTION = 'collectAdvertisingWingTraffic';
const EXTENSION_TIMEOUT_MS = 35 * 60_000;
// Only attempt creation gets a deadline here; status reads keep the API
// client's read default and the dispatch keeps its long extension wait.
const ATTEMPT_CREATE_TIMEOUT_MS = 30_000;
const ATTEMPT_POLL_MS = 2_000;
const EXTENSION_START_GRACE_MS = 30_000;
// The screen speaks Korean: Korean bridge and extension messages pass through,
// while browser transport errors and English reasons get these sentences.
const EXTENSION_FAILURE_FALLBACK = 'Wing 트래픽 수집 확장이 작업을 마치지 못했습니다.';
const EXTENSION_TRANSPORT_FAILURE = '확장과 통신하지 못했습니다. 확장 상태를 확인한 뒤 다시 시도해 주세요.';
const HANGUL = /[가-힣]/;

export type WingTrafficPlanRange = Readonly<{
  startDate: string;
  endDate: string;
}>;

type WingTrafficExtensionReply = Readonly<{ ok: true } | { ok: false; message: string }>;

/**
 * `terminal` carries the owner's result. `extension-failed` (a refusal or a
 * lost dispatch) and `extension-unresponsive` leave the attempt RUNNING and
 * resumable; neither fails it on the extension's behalf.
 */
type ReleasedAttempt =
  | Readonly<{ release: 'terminal'; attempt: AdTrafficSourceAttempt }>
  | Readonly<{ release: 'extension-failed'; attempt: AdTrafficSourceAttempt; failure: string }>
  | Readonly<{ release: 'extension-unresponsive'; attempt: AdTrafficSourceAttempt }>;

type WingTrafficCollectionOutcome = ReleasedAttempt & Readonly<{
  /** The extension's answer to this dispatch, or null when nothing was dispatched. */
  extensionReply: Promise<WingTrafficExtensionReply> | null;
}>;

/**
 * A running source attempt owns its frozen range. Keep the mismatch as a
 * structured error so the dashboard can disclose it instead of accidentally
 * resuming the wrong dates.
 */
export class WingTrafficRangeMismatchError extends Error {
  readonly code = 'WING_TRAFFIC_RANGE_MISMATCH';

  constructor(
    readonly activeRange: WingTrafficPlanRange,
    readonly requestedRange: Partial<WingTrafficPlanRange>,
  ) {
    super(
      `Wing 트래픽 수집이 이미 ${activeRange.startDate} ~ ${activeRange.endDate} 범위로 진행 중입니다. `
      + `요청한 ${requestedRange.startDate ?? '기본'} ~ ${requestedRange.endDate ?? '기본'} 범위로는 이어받지 않습니다.`,
    );
    this.name = 'WingTrafficRangeMismatchError';
  }
}

function extensionCapabilityFor(
  parserVersion: string | undefined,
): 'wingTrafficSourceOwnerV1' | 'wingTrafficSourceOwnerV2' {
  // V1 attempts are still resumable with the legacy extension. Every new
  // attempt and every V2 attempt must be admitted by the daily collector.
  return parserVersion === 'wing-traffic-v1'
    ? 'wingTrafficSourceOwnerV1'
    : 'wingTrafficSourceOwnerV2';
}

function requestedRangeMatches(
  plan: WingTrafficPlanRange,
  request: Pick<AdTrafficSourceBegin, 'startDate' | 'endDate'>,
): boolean {
  return (request.startDate === undefined || request.startDate === plan.startDate)
    && (request.endDate === undefined || request.endDate === plan.endDate);
}

function operatorText(text: unknown, fallback: string): string {
  const message = typeof text === 'string' ? text.trim() : '';
  return HANGUL.test(message) ? message : fallback;
}

function transportFailureText(error: unknown): string {
  return operatorText(error instanceof Error ? error.message : null, EXTENSION_TRANSPORT_FAILURE);
}

function rethrowTransportFailure(error: unknown): never {
  throw new Error(transportFailureText(error));
}

async function prepareExtension(
  requiredCapability: 'wingTrafficSourceOwnerV1' | 'wingTrafficSourceOwnerV2',
): Promise<string> {
  const extensionId = await detectExtensionId();
  if (!extensionId) {
    throw new Error('브라우저 수집 익스텐션을 찾을 수 없습니다.');
  }
  const ping = await sendToExtension<{
    success?: boolean;
    capabilities?: Record<string, unknown>;
  }>(extensionId, { action: 'ping' }).catch(rethrowTransportFailure);
  if (!ping?.success || ping.capabilities?.[requiredCapability] !== true) {
    throw new Error('Wing 트래픽 수집을 지원하는 익스텐션으로 새로고침해 주세요.');
  }
  await transferExtensionAuthTo(extensionId);
  return extensionId;
}

export async function readWingTrafficSource(
  channelAccountId?: string,
): Promise<ReturnType<typeof AdTrafficSourceStatusSchema.parse>> {
  const query = channelAccountId
    ? `?channelAccountId=${encodeURIComponent(channelAccountId)}`
    : '';
  return AdTrafficSourceStatusSchema.parse(
    await apiClient.get(`${SOURCE_PATH}/source${query}`),
  );
}

async function readAttempt(attemptId: string, signal?: AbortSignal): Promise<AdTrafficSourceAttempt> {
  const path = `${SOURCE_PATH}/attempts/${encodeURIComponent(attemptId)}`;
  const attempt = AdTrafficSourceAttemptSchema.parse(
    signal ? await apiClient.get(path, { signal }) : await apiClient.get(path),
  );
  if (attempt.attemptId !== attemptId) {
    throw new Error('Wing 트래픽 수집 시도 응답이 일치하지 않습니다.');
  }
  return attempt;
}

/**
 * The owner records nothing when the extension picks up a dispatch, so upload
 * progress on the attempt is the only server evidence that collection began.
 */
export function wingTrafficAttemptProgress(attempt: AdTrafficSourceAttempt): string {
  return [
    attempt.receiptCount,
    attempt.rowCount,
    attempt.expectedPages ?? '-',
    attempt.terminalPageObserved,
  ].join(':');
}

function extensionReplyFrom(response: unknown): WingTrafficExtensionReply {
  const reply = typeof response === 'object' && response !== null
    ? response as { success?: unknown; error?: unknown }
    : {};
  if (reply.success !== false) return { ok: true };
  return { ok: false, message: operatorText(reply.error, EXTENSION_FAILURE_FALLBACK) };
}

function extensionDispatchFailure(error: unknown): WingTrafficExtensionReply {
  return { ok: false, message: transportFailureText(error) };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new DOMException('The operation was aborted.', 'AbortError');
}

function wakeableDelay() {
  let wake: (() => void) | null = null;
  return {
    sleep(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          wake = null;
          resolve();
        }, ms);
        wake = () => {
          clearTimeout(timer);
          wake = null;
          resolve();
        };
      });
    },
    wake() {
      wake?.();
    },
  };
}

/**
 * Hold the operator until the owner attempt settles, the extension answers
 * with a failure, or the attempt shows no extension progress within the start
 * grace period. A success answer proves the extension ran, so only the owner
 * attempt releases it. A failed attempt read never releases by itself; it is
 * rethrown only at a release point (or past expiry) so the operator sees the
 * failure, not a guess. An aborted signal stops the observation.
 */
async function awaitRelease(
  dispatched: AdTrafficSourceAttempt,
  extensionReply: Promise<WingTrafficExtensionReply>,
  signal?: AbortSignal,
): Promise<ReleasedAttempt> {
  const poll = wakeableDelay();
  const answer: { reply: WingTrafficExtensionReply | null } = { reply: null };
  void extensionReply.then((reply) => {
    answer.reply = reply;
    poll.wake();
  });
  const wakeOnAbort = () => poll.wake();
  signal?.addEventListener('abort', wakeOnAbort, { once: true });
  const baseline = wingTrafficAttemptProgress(dispatched);
  const startDeadline = Date.now() + EXTENSION_START_GRACE_MS;
  let latest = dispatched;
  let started = false;

  try {
    for (;;) {
      throwIfAborted(signal);
      // A failed answer is checked against the attempt without waiting.
      if (answer.reply?.ok !== false) await poll.sleep(ATTEMPT_POLL_MS);
      throwIfAborted(signal);
      try {
        latest = await readAttempt(dispatched.attemptId, signal);
      } catch (error) {
        throwIfAborted(signal);
        const now = Date.now();
        if (
          answer.reply?.ok === false
          || (!started && now >= startDeadline)
          || now >= Date.parse(latest.expiresAt)
        ) {
          throw error;
        }
        continue;
      }
      if (latest.state !== 'RUNNING') return { release: 'terminal', attempt: latest };
      const reply = answer.reply;
      if (reply && !reply.ok) {
        return { release: 'extension-failed', attempt: latest, failure: reply.message };
      }
      started ||= reply !== null || wingTrafficAttemptProgress(latest) !== baseline;
      if (!started && Date.now() >= startDeadline) {
        return { release: 'extension-unresponsive', attempt: latest };
      }
    }
  } finally {
    signal?.removeEventListener('abort', wakeOnAbort);
  }
}

/**
 * Starts the dashboard's traffic owner; it never uploads or normalizes rows in
 * the browser. The request is released from the owner attempt rather than the
 * extension's answer, which keeps its 35-minute wait behind `extensionReply`.
 * Aborting `options.signal` only stops observing the attempt; the owner
 * attempt and any dispatched extension run continue.
 */
export async function collectWingTrafficSource(
  request: AdTrafficSourceBegin = {},
  options: Readonly<{ signal?: AbortSignal }> = {},
): Promise<WingTrafficCollectionOutcome> {
  const body = AdTrafficSourceBeginSchema.parse(request);
  const current = await readWingTrafficSource(body.channelAccountId);
  let attempt = current.latestAttempt;

  if (attempt?.state === 'RUNNING') {
    if (!requestedRangeMatches(attempt.plan, body)) {
      throw new WingTrafficRangeMismatchError(attempt.plan, body);
    }
  }

  const requiredCapability = extensionCapabilityFor(
    attempt?.state === 'RUNNING' ? attempt.plan.parserVersion : undefined,
  );
  // Extension detection and auth handoff are intentionally below the source
  // read/range guard: page entry and date changes remain read-only, and a
  // mismatched active run does not even attempt browser work.
  let extensionId = await prepareExtension(requiredCapability);

  if (attempt?.state !== 'RUNNING') {
    attempt = AdTrafficSourceAttemptSchema.parse(
      await apiClient.post(
        `${SOURCE_PATH}/attempts`,
        body,
        {
          headers: { 'Idempotency-Key': createSecureRandomUuid() },
          timeoutMs: ATTEMPT_CREATE_TIMEOUT_MS,
        },
      ),
    );
  }

  if (attempt.state !== 'RUNNING') {
    return {
      release: 'terminal',
      attempt: await readAttempt(attempt.attemptId, options.signal),
      extensionReply: null,
    };
  }

  // The source may have admitted another tab's running attempt after the
  // initial status read. Re-check the server-owned plan before dispatching
  // the browser action, and switch capabilities if the admitted parser is
  // legacy rather than the new daily collector (or vice versa).
  if (!requestedRangeMatches(attempt.plan, body)) {
    throw new WingTrafficRangeMismatchError(attempt.plan, body);
  }
  const admittedCapability = extensionCapabilityFor(attempt.plan.parserVersion);
  if (admittedCapability !== requiredCapability) {
    extensionId = await prepareExtension(admittedCapability);
  }
  const extensionReply = sendToExtension(
    extensionId,
    { action: EXTENSION_ACTION, attemptId: attempt.attemptId },
    EXTENSION_TIMEOUT_MS,
  ).then(extensionReplyFrom, extensionDispatchFailure);
  const released = await awaitRelease(attempt, extensionReply, options.signal);
  return { ...released, extensionReply };
}

/**
 * Reuse the extension owner's existing cancellation action for a running
 * dashboard attempt. The browser owner remains responsible for terminal
 * reconciliation; the web app only rereads its canonical attempt afterward.
 */
export async function cancelWingTrafficSource(
  attemptId: string,
  parserVersion?: string,
): Promise<AdTrafficSourceAttempt> {
  const extensionId = await prepareExtension(extensionCapabilityFor(parserVersion));
  await sendToExtension(
    extensionId,
    { action: 'cancelAdvertisingWingTraffic', attemptId },
    EXTENSION_TIMEOUT_MS,
  ).catch(rethrowTransportFailure);
  return readAttempt(attemptId);
}
