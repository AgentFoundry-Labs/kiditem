/**
 * Agent Org 의 상태 어휘 — 열두 가지, 서로 겹치지 않는다.
 *
 * 한 칸이 두 가지로 읽히면 화면을 믿을 수 없다. 특히 네 쌍은 반드시 갈라 둔다.
 * - 실패 ≠ 사람 대기: 사람이 승인할 차례인 것을 빨갛게 칠하지 않는다.
 * - 실패 ≠ 재시도 중: 잠깐 답을 못 받은 것은 고장이 아니다.
 * - 모름 ≠ 0: 받은 적 없는 숫자는 0 이 아니라 '데이터 없음'이다.
 * - 보냄 ≠ 완료: 결과까지 확인된 것만 완료다.
 *
 * 색은 보조일 뿐이다. 화면은 모든 상태를 아이콘과 글로 같이 적는다.
 */
export const PIPE_STATES = [
  'running',
  'queued',
  'done',
  'partial',
  'retrying',
  'failed',
  'waiting_human',
  'blocked_external',
  'stale',
  'unknown',
  'skipped',
  'rejected',
] as const;

export type PipeState = (typeof PIPE_STATES)[number];

/**
 * 한 단계에 신호가 여럿이면 사람이 먼저 봐야 할 것이 머리에 선다.
 *
 * '모름'은 '완료'보다 앞에 둔다 — 확장이 없어서 못 본 것을 정상으로 치지 않기 위해서다.
 * 신호가 하나도 없는 단계는 이 목록을 거치지 않고 따로 '모름'이 된다.
 */
export const PIPE_STATE_PRECEDENCE: readonly PipeState[] = [
  'blocked_external',
  'failed',
  'waiting_human',
  'retrying',
  'stale',
  'partial',
  'running',
  'queued',
  'unknown',
  'rejected',
  'done',
  'skipped',
];

const RANK = new Map(PIPE_STATE_PRECEDENCE.map((state, index) => [state, index]));

export function pipeStateRank(state: PipeState): number {
  return RANK.get(state) ?? PIPE_STATE_PRECEDENCE.length;
}

/** 가장 먼저 봐야 할 상태. 아무것도 없으면 `null`. */
export function worstPipeState(states: Iterable<PipeState>): PipeState | null {
  let worst: PipeState | null = null;
  for (const state of states) {
    if (worst === null || pipeStateRank(state) < pipeStateRank(worst)) worst = state;
  }
  return worst;
}

export const PIPE_STATE_LABEL: Readonly<Record<PipeState, string>> = {
  running: '진행 중',
  queued: '대기',
  done: '완료',
  partial: '부분',
  retrying: '재시도 중',
  failed: '실패',
  waiting_human: '사람 대기',
  blocked_external: '로그인·인증',
  stale: '오래됨',
  unknown: '모름',
  skipped: '해당 없음',
  rejected: '반려',
};

/** 받은 적 없는 숫자 자리에 쓰는 말. 0 을 쓰지 않는다. */
export const PIPE_NO_DATA = '데이터 없음';
