import type { MallSessionProbeResult } from '@/lib/mall-session-probe';
import type { TileLoginState } from './mall-alerts';

/**
 * 몰 로그인 상태 — 확장이 조용히 확인한 결과를 화면 말로 옮긴다.
 *
 * 확인 자체는 `@/lib/mall-session-probe` 가 담당한다. 여기는 화면이 쓰는 모양만 만든다 —
 * 상태는 로그인됨 · 인증 필요 · 로그인 필요 셋뿐이다.
 */
export type MallSessionProbeStatus = 'idle' | 'running' | 'done' | 'no_extension' | 'outdated';

export interface MallSessionCounts {
  signedIn: number;
  verification: number;
  signedOut: number;
  checking: number;
}

/** 몰별 상태가 로그인 상태를 말하는 데 쓰는 것. */
export interface MallSessionView {
  status: MallSessionProbeStatus;
  counts: MallSessionCounts;
  /** 마지막으로 다 확인한 때. */
  checkedAt: number | null;
  /** 옛 확장일 때 그 버전 — 없는 확장과 옛 확장을 가르려고. */
  extensionVersion: string | null;
  recheck: () => void;
}

/** 로그인해야 하는 몰 — 세션이 풀렸거나 계정 정보가 없는 몰(둘 다인 몰은 한 번). */
export interface LoginNeededCount {
  total: number;
  /** 확장이 확인한 결과 세션이 풀린 몰. 확인하지 못했으면 `null`. */
  signedOut: number | null;
  noCredentials: number;
}

/** 몰마다 타일에 붙일 로그인 상태. 확인 중이면 '확인 중', 결과가 없으면 넣지 않는다. */
export function mallSessionStates(
  mallKeys: readonly string[],
  results: Readonly<Record<string, MallSessionProbeResult>>,
  checking: ReadonlySet<string>,
): Record<string, TileLoginState> {
  const states: Record<string, TileLoginState> = {};
  for (const key of mallKeys) {
    if (checking.has(key)) {
      states[key] = 'checking';
      continue;
    }
    const result = results[key];
    if (!result) continue;
    states[key] = result.state === 'verification_required' ? 'verification' : result.state;
  }
  return states;
}

export function countMallSessions(states: Readonly<Record<string, TileLoginState>>): MallSessionCounts {
  const counts: MallSessionCounts = { signedIn: 0, verification: 0, signedOut: 0, checking: 0 };
  for (const state of Object.values(states)) {
    if (state === 'signed_in') counts.signedIn += 1;
    else if (state === 'verification') counts.verification += 1;
    else if (state === 'checking') counts.checking += 1;
    else counts.signedOut += 1;
  }
  return counts;
}
