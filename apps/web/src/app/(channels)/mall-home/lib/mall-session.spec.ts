import { describe, expect, it } from 'vitest';
import type { MallSessionProbeResult } from '@/lib/mall-session-probe';
import { countMallSessions, mallSessionStates } from './mall-session';

const probe = (
  mallKey: string,
  state: MallSessionProbeResult['state'],
  reason: string | null = null,
): MallSessionProbeResult => ({ mallKey, state, reason, checkedAt: 0 });

describe('mallSessionStates · countMallSessions', () => {
  /** 사장님: "로그인됨 / 인증 필요 / 로그인 필요 3가지 아냐?" — 확인한 몰은 그 셋 중 하나다. */
  it('⭐ 확인한 몰은 로그인됨 · 인증 필요 · 로그인 필요 셋으로 센다, 확인 중이면 확인 중', () => {
    const states = mallSessionStates(
      ['onch', 'kidsnote', 'kidkids', 'art09'],
      {
        onch: probe('onch', 'signed_in'),
        kidkids: probe('kidkids', 'verification_required'),
        art09: probe('art09', 'signed_out'),
      },
      new Set(['kidsnote']),
    );
    expect(states).toEqual({ onch: 'signed_in', kidsnote: 'checking', kidkids: 'verification', art09: 'signed_out' });
    expect(countMallSessions(states)).toEqual({ signedIn: 1, verification: 1, signedOut: 1, checking: 1 });
    expect(mallSessionStates(['onch'], {}, new Set())).toEqual({});
  });
});
