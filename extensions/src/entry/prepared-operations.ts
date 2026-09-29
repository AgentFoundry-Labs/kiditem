import { AD_ACTION_KIND } from '@kiditem/shared/advertising-operations';
import type { OperationKind } from '@kiditem/shared/operation';
import { AD_ACTION_LINKED_PHASE } from '../collectors/advertising.ad_action';
import type { OperationRunner, RunOutcome } from '../core/runner';

/**
 * 팝업 "승인된 광고 액션 실행"(KID-386) → 서버가 준비해 둔 실행(`prepared`)을 claim해 후보가 없을 때까지 하나씩 돌린다.
 * 백그라운드 폴링은 두지 않는다(사무실 PC가 늘 켜져 있지 않다) — 이 버튼이 유일한 실행 계기이고, 한 번에 하나씩 도는 것도
 * 여기서 지킨다(광고 액션은 광고센터 계정 잠금을 쥐지 않는다).
 */
export const RUN_PREPARED_OPERATIONS = 'runPreparedOperations' as const;
/** 팝업이 돌릴 수 있는 준비 실행 kind. */
export const PREPARED_OPERATION_KINDS: readonly OperationKind[] = [AD_ACTION_KIND];
/** 한 번 누름에 도는 상한(광고센터 쓰기가 끝없이 이어지지 않게). */
export const MAX_PREPARED_RUNS = 20;
const WORKER_ID = 'kiditem-extension-popup';

/**
 * 액션 하나가 아니라 광고센터 세션·화면 전체의 문제인 실패 — 이어서 claim하면 남은 준비 실행을 모두 같은 까닭으로 태운다.
 * 그 실행에서 멈추고 남은 것은 손대지 않는다(운영자가 고친 뒤 다시 누른다).
 */
const STOPPING_FAILURES: Readonly<Record<string, string>> = {
  SITE_LOGIN_REQUIRED: '쿠팡 광고센터에 로그인한 뒤 다시 실행해 주세요.',
  ADVERTISING_IDENTITY_MISMATCH: '광고 액션의 업체로 광고센터에 다시 로그인한 뒤 실행해 주세요.',
  ADVERTISING_AD_CENTER_FORM_CHANGED: '광고센터 등록 화면이 바뀌어 남은 액션을 멈췄습니다. 개발자에게 알려 주세요.',
};

export type PreparedRunSummary =
  /** `linked`: 같은 이름 캠페인이 이미 있어 쓰지 않고 연결했다(`created`와 따로). */
  | { ok: true; ran: number; created: number; linked: number; uncertain: number; failed: number; messages: string[]; stopped?: string }
  | { ok: false; error: string; errorCode?: string; ran: number };

export async function runPreparedOperations(
  runner: OperationRunner,
  input: { kinds: OperationKind[]; workerId: string; signal: AbortSignal; maxRuns?: number },
): Promise<PreparedRunSummary> {
  const counts = { ran: 0, created: 0, linked: 0, uncertain: 0, failed: 0 };
  const messages: string[] = [];
  const maxRuns = input.maxRuns ?? MAX_PREPARED_RUNS;
  while (counts.ran < maxRuns && !input.signal.aborted) {
    const outcome = await runner.runClaimed({ kinds: input.kinds, workerId: input.workerId, signal: input.signal });
    if (!outcome) break;
    if (outcome.kind === 'failed' && outcome.operationId === null) {
      // claim이 거절됐다(서버 연결·권한) — 받은 실행이 없으니 멈춘다.
      return { ok: false, errorCode: outcome.errorCode, error: outcome.errorMessage, ran: counts.ran };
    }
    counts.ran += 1;
    const { bucket, message } = classify(outcome);
    counts[bucket] += 1;
    if (message) messages.push(message);
    const stopped = STOPPING_FAILURES[failureCode(outcome) ?? ''];
    if (stopped) return { ok: true, ...counts, messages, stopped };
  }
  return { ok: true, ...counts, messages };
}

function failureCode(outcome: RunOutcome): string | null {
  if (outcome.kind === 'failed') return outcome.errorCode;
  if (outcome.kind === 'finished' && outcome.operation.status === 'failed') return outcome.operation.errorCode;
  return null;
}

function classify(outcome: RunOutcome): { bucket: 'created' | 'linked' | 'uncertain' | 'failed'; message: string | null } {
  if (outcome.kind === 'finished') {
    const { status, result, progress, errorMessage } = outcome.operation;
    if (status === 'succeeded') {
      const message = typeof result?.message === 'string' ? result.message : null;
      if (result?.providerOutcome === 'uncertain') return { bucket: 'uncertain', message };
      return { bucket: progress?.phase === AD_ACTION_LINKED_PHASE ? 'linked' : 'created', message: null };
    }
    return { bucket: 'failed', message: errorMessage };
  }
  if (outcome.kind === 'failed') return { bucket: 'failed', message: outcome.errorMessage };
  if (outcome.kind === 'fence_lost') return { bucket: 'failed', message: '실행 임대가 끝나 멈췄습니다.' };
  return { bucket: 'failed', message: outcome.message ?? null };
}

export interface PreparedOperationsChrome {
  runtime: {
    id: string;
    onMessage: { addListener(listener: (message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean | void): void };
  };
}

export interface PreparedOperationsDeps {
  /** 환경(local·office) → 그 환경의 runner. */
  runnerFor(environmentId: string): OperationRunner;
  keepAlive?(work: Promise<unknown>): void;
}

/** 팝업 메시지 `{type: runPreparedOperations, environmentId, kinds}`를 받는다. 탭·다른 확장에서 온 것은 거절한다. */
export function installPreparedOperations(chromeApi: PreparedOperationsChrome, deps: PreparedOperationsDeps): void {
  let running: Promise<PreparedRunSummary> | null = null;
  chromeApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const record = message && typeof message === 'object' ? (message as Record<string, unknown>) : null;
    if (record?.type !== RUN_PREPARED_OPERATIONS) return;
    const from = sender && typeof sender === 'object' ? (sender as { id?: unknown; tab?: unknown }) : null;
    if (from?.id !== chromeApi.runtime.id || from.tab) {
      sendResponse({ ok: false, error: '확장 팝업에서만 실행할 수 있습니다.', ran: 0 });
      return;
    }
    const environmentId = record.environmentId;
    const kinds = Array.isArray(record.kinds) ? record.kinds : [];
    if (typeof environmentId !== 'string' || !environmentId || kinds.length === 0
      || !kinds.every((kind) => typeof kind === 'string' && PREPARED_OPERATION_KINDS.includes(kind))) {
      sendResponse({ ok: false, error: '실행할 환경과 종류를 확인해 주세요.', ran: 0 });
      return;
    }
    if (running) {
      sendResponse({ ok: false, error: '승인된 광고 액션을 이미 실행하고 있습니다.', ran: 0 });
      return;
    }
    const work = runPreparedOperations(deps.runnerFor(environmentId), {
      kinds: kinds as OperationKind[],
      workerId: WORKER_ID,
      signal: new AbortController().signal,
    }).catch((error: unknown): PreparedRunSummary => ({ ok: false, error: error instanceof Error ? error.message : String(error), ran: 0 }));
    running = work.finally(() => {
      running = null;
    });
    deps.keepAlive?.(running);
    running.then(sendResponse);
    return true;
  });
}
