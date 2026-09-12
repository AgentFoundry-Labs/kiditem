'use client';

import type { MallOperationOutcomeSummaryRow } from '@kiditem/shared/mall-operation-outcomes';
import { detectOrderCollectionExtensionRuntime, sendToExtension } from './extension-bridge';
import { clearMallAutoLoginBlock } from './mall-login-block';
import {
  mallOperationOutcomesApi,
  recordMallOperationOutcome,
  type MallOperationOutcomeInput,
} from './mall-operation-outcomes-api';

/**
 * 몰 로그인 상태 조용히 확인.
 *
 * 확장이 몰마다 정해진 읽기 전용 주소 하나를 사용자 쿠키로 읽어 판단한다. 로그인은 하지
 * 않는다 — 비밀번호를 넘기지 않고, 확장은 상태와 이유 코드만 돌려준다. 확인할 신호가
 * 없는 몰은 `unknown`(확인 불가)이다.
 */
export const MALL_SESSION_PROBE_CAPABILITY = 'mallSessionProbeV1';

export type MallSessionState = 'signed_in' | 'signed_out' | 'unknown';

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

/** 확인 결과를 기억 한 줄로. 몰 키와 이유 코드만 담는다. 확인 불가는 적지 않는다. */
export function loginCheckRecord(result: MallSessionProbeResult): LoginCheckRecord | null {
  if (result.state === 'signed_in') {
    return {
      mallKey: result.mallKey,
      operation: 'login_check',
      outcome: 'succeeded',
      reasonCode: 'session_alive',
      trigger: 'auto',
    };
  }
  if (result.state === 'signed_out') {
    return {
      mallKey: result.mallKey,
      operation: 'login_check',
      outcome: 'attention',
      reasonCode: result.reason === 'verification_required' ? 'verification_required' : 'login_required',
      trigger: 'auto',
    };
  }
  return null;
}

/** 기억에 적을까 — 처음이거나, 상태가 바뀌었거나, 같은 상태로 6시간이 지났을 때만. */
export function shouldRememberLogin(
  record: LoginCheckRecord,
  checkedAt: number,
  remembered: readonly MallOperationOutcomeSummaryRow[],
  recordedHere?: RecordedLoginCheck,
): boolean {
  const latest = remembered.find(
    (row) => row.mallKey === record.mallKey && row.operation === 'login_check',
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
  signedOut: number;
  unknown: number;
  /**
   * 방금 확인해서 '로그인 필요'로 나온 몰들. 자동 운전 고리는 이 몰의 수집을 이번 바퀴에
   * 건너뛴다 — 어차피 로그인 화면만 나오고, 몰 탭만 하나 더 열린 채 남기 때문이다.
   * '확인 불가'는 여기 넣지 않는다. 확인할 신호가 없는 것이지 로그아웃된 것이 아니다.
   */
  signedOutKeys: string[];
}

/**
 * 여러 몰의 로그인 상태를 한 바퀴 확인한다 — 자동 운전 고리가 쓰는 길.
 *
 * 확장이 없거나 옛 버전이면 아무 몰도 건드리지 않고 0으로 돌려준다. 결과가 바뀐 몰만
 * 기억(`login_check`)에 남는다. 로그인은 하지 않는다.
 */
export async function sweepMallSessions(mallKeys: readonly string[]): Promise<MallSessionSweep> {
  const empty: MallSessionSweep = { checked: 0, signedIn: 0, signedOut: 0, unknown: 0, signedOutKeys: [] };
  const keys = [...new Set(mallKeys)].filter((key) => key.length > 0);
  if (keys.length === 0) return empty;
  const runtime = await detectMallSessionProbe();
  if (runtime.status !== 'ready') return empty;

  const remembered = await mallOperationOutcomesApi
    .summary(7)
    .then((summary) => summary.rows)
    .catch(() => [] as MallOperationOutcomeSummaryRow[]);
  const sweep: MallSessionSweep = { ...empty, signedOutKeys: [] };
  let cursor = 0;
  const worker = async () => {
    while (cursor < keys.length) {
      const key = keys[cursor];
      cursor += 1;
      if (key === undefined) break;
      const result = await probeMallSession(runtime.extensionId, key);
      sweep.checked += 1;
      if (result.state === 'signed_in') {
        sweep.signedIn += 1;
        // 사람이 직접 로그인했다 — 막아 뒀던 자동 로그인을 다시 연다.
        clearMallAutoLoginBlock(key);
      } else if (result.state === 'signed_out') {
        sweep.signedOut += 1;
        sweep.signedOutKeys.push(key);
      } else sweep.unknown += 1;
      const record = loginCheckRecord(result);
      if (record && shouldRememberLogin(record, result.checkedAt, remembered)) {
        await recordMallOperationOutcome(record);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, keys.length) }, () => worker()));
  return sweep;
}

/** 한 몰의 로그인 상태. 실패해도 던지지 않고 '확인 불가'로 돌려준다. */
export async function probeMallSession(extensionId: string, mallKey: string): Promise<MallSessionProbeResult> {
  try {
    const response = await sendToExtension<{ success?: boolean; state?: unknown; reason?: unknown }>(
      extensionId,
      { action: 'probeMallSession', mallKey },
      20_000,
    );
    const state: MallSessionState =
      response?.state === 'signed_in' || response?.state === 'signed_out' ? response.state : 'unknown';
    const reason = typeof response?.reason === 'string' && REASON.test(response.reason) ? response.reason : null;
    return { mallKey, state, reason, checkedAt: Date.now() };
  } catch {
    return { mallKey, state: 'unknown', reason: 'extension_error', checkedAt: Date.now() };
  }
}
