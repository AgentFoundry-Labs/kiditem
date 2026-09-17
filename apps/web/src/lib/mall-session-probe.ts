'use client';

import {
  mallOperationOutcomeKey,
  type MallOperationOutcomeSummaryRow,
} from '@kiditem/shared/mall-operation-outcomes';
import { detectOrderCollectionExtensionRuntime, sendToExtension } from './extension-bridge';
import { clearMallAutoLoginBlock } from './mall-login-block';
import {
  mallOperationOutcomesApi,
  recordMallOperationOutcome,
  type MallOperationOutcomeInput,
} from './mall-operation-outcomes-api';

/**
 * 몰 로그인 상태 확인 — 로그인됨 · 인증 필요 · 로그인 필요 중 하나.
 *
 * 확장이 몰마다 정해진 읽기 전용 주소를 사용자 쿠키로 먼저 읽고, 그걸로 가릴 수 없으면
 * 관리자 화면을 백그라운드 탭에 실제로 열어 로그인 폼 · 인증 화면이 뜨는지 본 뒤 바로 닫는다.
 * 로그인은 하지 않는다 — 비밀번호를 넘기지 않고, 확장은 상태와 이유 코드만 돌려준다.
 * 사장님: "로그인됨 / 인증 필요 / 로그인 필요 3가지 아냐?" — 확인 불가는 없다. 확인할 주소가
 * 없거나 화면에 닿지 못한 몰은, 사람이 몰에 들어가 봐야 하므로 로그인 필요로 답하고 이유를
 * 함께 적는다.
 */
export const MALL_SESSION_PROBE_CAPABILITY = 'mallLoginCheckV2';

export type MallSessionState = 'signed_in' | 'verification_required' | 'signed_out';

/** 우리 쪽 사정으로 몰을 보지 못한 이유. 몰을 본 사실이 아니라서 관찰 기록에는 남기지 않는다. */
const OUR_SIDE_REASONS = new Set(['extension_no_answer', 'login_page_not_reachable', 'no_login_address']);

export interface MallSessionProbeResult {
  mallKey: string;
  state: MallSessionState;
  reason: string | null;
  checkedAt: number;
}

export type MallSessionProbeRuntime =
  | { status: 'ready'; extensionId: string }
  | { status: 'outdated'; version: string }
  | { status: 'not_found' };

const REASON = /^[a-z][a-z0-9_]{0,63}$/;

/** 확장이 있고 로그인 확인을 아는 버전인가. 옛 버전은 없는 것과 따로 알린다. */
export async function detectMallSessionProbe(): Promise<MallSessionProbeRuntime> {
  const runtime = await detectOrderCollectionExtensionRuntime(1500, [MALL_SESSION_PROBE_CAPABILITY]);
  if (runtime.status === 'ready') return { status: 'ready', extensionId: runtime.extensionId };
  if (runtime.status === 'incompatible') return { status: 'outdated', version: runtime.version };
  return { status: 'not_found' };
}

/** 상태가 같으면 이 시간이 지나야 기억에 다시 적는다 — 열 때마다 같은 줄이 쌓이지 않게. */
export const LOGIN_RECORD_REFRESH_MS = 6 * 60 * 60 * 1000;

export type LoginCheckRecord = MallOperationOutcomeInput & { outcome: 'succeeded' | 'attention' };

/** 이 화면에서 이미 적은 것 — 기억 요약을 다시 받기 전에 같은 줄을 두 번 적지 않게. */
export interface RecordedLoginCheck {
  outcome: string;
  at: number;
}

/**
 * 확인 결과를 기억 한 줄로. 몰 키와 이유 코드만 담는다. 우리 쪽 사정으로 몰을 보지 못한
 * 결과(확장 무응답 · 화면에 닿지 못함 · 확인할 주소 없음)는 몰에 대한 관찰이 아니라 적지 않는다.
 */
export function loginCheckRecord(result: MallSessionProbeResult): LoginCheckRecord | null {
  if (result.state === 'signed_in') {
    return {
      mallKey: result.mallKey,
      operation: 'login_check',
      outcome: 'succeeded',
      reasonCode: 'session_alive',
    };
  }
  if (result.state === 'verification_required') {
    return {
      mallKey: result.mallKey,
      operation: 'login_check',
      outcome: 'attention',
      reasonCode: 'verification_required',
    };
  }
  if (result.reason && OUR_SIDE_REASONS.has(result.reason)) return null;
  return {
    mallKey: result.mallKey,
    operation: 'login_check',
    outcome: 'attention',
    reasonCode: 'login_required',
  };
}

/**
 * 기억에 적을까 — 처음이거나, 상태가 바뀌었거나, 같은 상태로 6시간이 지났을 때만.
 *
 * 줄은 기록 키로 찾는다. 계정 행을 함께 쓰는 몰(쿠팡직배송)은 로켓 줄이 제 기록이다 —
 * 몰 키 그대로 찾으면 못 찾아 한 바퀴마다 같은 줄을 새로 쌓는다.
 */
export function shouldRememberLogin(
  record: LoginCheckRecord,
  checkedAt: number,
  remembered: readonly MallOperationOutcomeSummaryRow[],
  recordedHere?: RecordedLoginCheck,
): boolean {
  const outcomeKey = mallOperationOutcomeKey(record.mallKey);
  const latest = remembered.find(
    (row) => row.mallKey === outcomeKey && row.operation === 'login_check',
  )?.latest;
  const previous = [
    ...(latest ? [{ outcome: latest.outcome as string, at: Date.parse(latest.occurredAt) }] : []),
    ...(recordedHere ? [recordedHere] : []),
  ].sort((a, b) => b.at - a.at)[0];
  if (!previous) return true;
  if (previous.outcome !== record.outcome) return true;
  return checkedAt - previous.at > LOGIN_RECORD_REFRESH_MS;
}

export interface MallSessionSweep {
  checked: number;
  signedIn: number;
  verification: number;
  signedOut: number;
  /**
   * 방금 확인해서 '로그인 필요' · '인증 필요'로 나온 몰들. 자동 운전 고리는 이 몰의 수집을
   * 이번 바퀴에 건너뛴다 — 어차피 로그인 · 인증 화면만 나오고, 사람이 해야 끝난다.
   */
  signedOutKeys: string[];
}

/**
 * 여러 몰의 로그인 상태를 한 바퀴 확인한다 — 자동 운전 고리가 쓰는 길.
 *
 * 확장이 없거나 옛 버전이면 아무 몰도 건드리지 않고 0으로 돌려준다. 결과가 바뀐 몰만
 * 기억(`login_check`)에 남는다. 로그인은 하지 않는다.
 */
export async function sweepMallSessions(
  mallKeys: readonly string[],
  /** 몰마다 쇼핑몰 계정에 저장된 사이트 주소. 고정 확인 주소가 없는 몰은 이 화면을 열어 본다. */
  siteUrls: Readonly<Record<string, string | null | undefined>> = {},
): Promise<MallSessionSweep> {
  const empty: MallSessionSweep = { checked: 0, signedIn: 0, verification: 0, signedOut: 0, signedOutKeys: [] };
  const keys = [...new Set(mallKeys)].filter((key) => key.length > 0);
  if (keys.length === 0) return empty;
  const runtime = await detectMallSessionProbe();
  if (runtime.status !== 'ready') return empty;

  const remembered = await mallOperationOutcomesApi
    .summary(7)
    .then((summary) => summary.rows)
    .catch(() => [] as MallOperationOutcomeSummaryRow[]);
  const sweep: MallSessionSweep = { ...empty, signedOutKeys: [] };
  /**
   * 이번 바퀴에 이미 적은 기록 키. 계정 행을 함께 쓰는 몰들(쿠팡직배송 · 로켓)은 한 줄에
   * 쌓이는데, 위 기억 요약은 바퀴 처음에 한 번만 읽고 일꾼 셋이 동시에 돈다 — 서로 모르면
   * 둘 다 '적어야 한다'로 보고 같은 줄을 두 번 쌓는다. 적기 전에(먼저 담고 나서 보낸다)
   * 담아 두어 한 바퀴에 한 줄로 만든다.
   */
  const recordedThisRound = new Set<string>();
  let cursor = 0;
  const worker = async () => {
    while (cursor < keys.length) {
      const key = keys[cursor];
      cursor += 1;
      if (key === undefined) break;
      const result = await probeMallSession(runtime.extensionId, key, siteUrls[key] ?? null);
      sweep.checked += 1;
      if (result.state === 'signed_in') {
        sweep.signedIn += 1;
        // 사람이 직접 로그인했다 — 막아 뒀던 자동 로그인을 다시 연다.
        clearMallAutoLoginBlock(key);
      } else {
        if (result.state === 'verification_required') sweep.verification += 1;
        else sweep.signedOut += 1;
        sweep.signedOutKeys.push(key);
      }
      const record = loginCheckRecord(result);
      if (record) {
        const outcomeKey = mallOperationOutcomeKey(record.mallKey);
        if (!recordedThisRound.has(outcomeKey) && shouldRememberLogin(record, result.checkedAt, remembered)) {
          recordedThisRound.add(outcomeKey);
          await recordMallOperationOutcome(record);
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, keys.length) }, () => worker()));
  return sweep;
}

/**
 * 한 몰의 로그인 상태. 실패해도 던지지 않는다 — 확장이 답하지 않으면 사람이 몰에 들어가
 * 봐야 하므로 로그인 필요로, 이유(`extension_no_answer`)와 함께 돌려준다.
 */
export async function probeMallSession(
  extensionId: string,
  mallKey: string,
  siteUrl: string | null = null,
): Promise<MallSessionProbeResult> {
  try {
    const response = await sendToExtension<{ success?: boolean; state?: unknown; reason?: unknown }>(
      extensionId,
      { action: 'checkMallLogin', mallKey, ...(siteUrl ? { siteUrl } : {}) },
      // 조용히 읽어 모르면 화면을 열어 본다 — 화면 로드와 두 번 보기까지 기다린다.
      45_000,
    );
    const state: MallSessionState =
      response?.state === 'signed_in' || response?.state === 'verification_required'
        ? response.state
        : 'signed_out';
    const reason = typeof response?.reason === 'string' && REASON.test(response.reason)
      ? response.reason
      : response ? null : 'extension_no_answer';
    return { mallKey, state, reason, checkedAt: Date.now() };
  } catch {
    return { mallKey, state: 'signed_out', reason: 'extension_no_answer', checkedAt: Date.now() };
  }
}
