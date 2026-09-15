import { describe, expect, it } from 'vitest';
import type { MallOperationOutcomeSummaryRow } from '@kiditem/shared/mall-operation-outcomes';
import type { MallSessionProbeResult } from '@/lib/mall-session-probe';
import {
  LOGIN_RECORD_REFRESH_MS,
  countMallSessions,
  loginCheckRecord,
  mallSessionStates,
  shouldRememberLogin,
} from './mall-session';

const NOW = Date.parse('2026-09-12T03:00:00.000Z');

const probe = (
  mallKey: string,
  state: MallSessionProbeResult['state'],
  reason: string | null = null,
): MallSessionProbeResult => ({ mallKey, state, reason, checkedAt: NOW });

function remembered(outcome: 'succeeded' | 'attention', occurredAt: string): MallOperationOutcomeSummaryRow {
  return {
    mallKey: 'onch',
    operation: 'login_check',
    latest: {
      id: '44444444-4444-4444-8444-444444444444',
      mallKey: 'onch',
      operation: 'login_check',
      outcome,
      reasonCode: outcome === 'succeeded' ? 'session_alive' : 'login_required',
      message: null,
      itemCount: null,
      failedCount: null,
      warningCount: null,
      occurredAt,
    },
    counts: { succeeded: 0, empty: 0, attention: 1, failed: 0, cancelled: 0 },
  };
}

const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe('loginCheckRecord', () => {
  it('⭐ 로그인됨은 성공, 풀림은 사람이 할 일 — 몰 키와 이유 코드만 담는다', () => {
    expect(loginCheckRecord(probe('onch', 'signed_in', 'admin_page'))).toEqual({
      mallKey: 'onch',
      operation: 'login_check',
      outcome: 'succeeded',
      reasonCode: 'session_alive',
    });
    expect(loginCheckRecord(probe('onch', 'signed_out', 'login_page'))).toEqual({
      mallKey: 'onch',
      operation: 'login_check',
      outcome: 'attention',
      reasonCode: 'login_required',
    });
    expect(loginCheckRecord(probe('kidkids', 'signed_out', 'verification_required'))?.reasonCode).toBe(
      'verification_required',
    );
  });

  it('확인 불가는 관찰 기록에 적지 않는다', () => {
    expect(loginCheckRecord(probe('coupang', 'unknown', 'no_passive_check'))).toBeNull();
  });
});

describe('shouldRememberLogin', () => {
  const signedOut = loginCheckRecord(probe('onch', 'signed_out'))!;

  it('처음 보는 몰은 적는다', () => {
    expect(shouldRememberLogin(signedOut, NOW, [])).toBe(true);
  });

  /** 쇼핑몰 홈은 자주 열린다. 같은 상태를 열 때마다 적으면 기억이 소음이 된다. */
  it('⭐ 같은 상태는 6시간이 지나야 다시 적는다', () => {
    expect(shouldRememberLogin(signedOut, NOW, [remembered('attention', ago(60 * 60 * 1000))])).toBe(false);
    expect(
      shouldRememberLogin(signedOut, NOW, [remembered('attention', ago(LOGIN_RECORD_REFRESH_MS + 1000))]),
    ).toBe(true);
  });

  it('상태가 바뀌면 바로 적는다', () => {
    expect(shouldRememberLogin(signedOut, NOW, [remembered('succeeded', ago(60 * 1000))])).toBe(true);
  });

  it('이 화면에서 방금 적은 것이 기억 요약보다 새것이면 그것을 본다', () => {
    expect(
      shouldRememberLogin(signedOut, NOW, [remembered('succeeded', ago(60 * 1000))], {
        outcome: 'attention',
        at: NOW - 1000,
      }),
    ).toBe(false);
  });
});

describe('mallSessionStates · countMallSessions', () => {
  it('확인 중이면 확인 중, 결과가 없는 몰은 비워 둔다', () => {
    const states = mallSessionStates(
      ['onch', 'kidsnote', 'coupang', 'art09'],
      {
        onch: probe('onch', 'signed_in'),
        coupang: probe('coupang', 'unknown'),
        art09: probe('art09', 'signed_out'),
      },
      new Set(['kidsnote']),
    );
    expect(states).toEqual({ onch: 'signed_in', kidsnote: 'checking', coupang: 'unknown', art09: 'signed_out' });
    expect(countMallSessions(states)).toEqual({ signedIn: 1, signedOut: 1, unknown: 1, checking: 1 });
    expect(mallSessionStates(['onch'], {}, new Set())).toEqual({});
  });
});
