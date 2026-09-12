import { afterEach, describe, expect, it } from 'vitest';
import {
  AGENT_LOOP_DEFAULT_INTERVAL_MIN,
  getMallAgentLoopState,
  isWithinAgentBusinessHours,
  markMallAgentLoopFinished,
  nextAgentRunAt,
  requestMallAgentLoopRun,
  resetMallAgentLoopForTest,
  resolveMallAgentLoopStartAt,
  seedMallAgentLoopScheduleForTest,
  setMallAgentLoopEnabled,
  setMallAgentLoopInterval,
  subscribeMallAgentLoop,
  AGENT_LOOP_FIRST_RUN_DELAY_MS,
} from '../mall-agent-loop';

afterEach(() => {
  resetMallAgentLoopForTest();
  window.localStorage.clear();
});

const at = (hour: number, minute = 0) => new Date(2026, 8, 14, hour, minute).getTime();

describe('업무시간', () => {
  it('⭐ 수집은 09~18시에만 — 그 밖의 시간에는 돌지 않는다', () => {
    expect(isWithinAgentBusinessHours(at(8, 59))).toBe(false);
    expect(isWithinAgentBusinessHours(at(9))).toBe(true);
    expect(isWithinAgentBusinessHours(at(17, 59))).toBe(true);
    expect(isWithinAgentBusinessHours(at(18))).toBe(false);
  });
});

describe('다음 실행 시각', () => {
  it('업무시간 안이면 간격만큼 뒤', () => {
    expect(nextAgentRunAt(at(10), 30 * 60 * 1000)).toBe(at(10, 30));
  });

  it('⭐ 업무 종료를 넘기면 다음 날 아침 9시로 미룬다', () => {
    const next = new Date(nextAgentRunAt(at(17, 50), 30 * 60 * 1000));
    expect(next.getDate()).toBe(15);
    expect(next.getHours()).toBe(9);
  });

  it('업무 시작 전이면 그날 9시로 당긴다', () => {
    const next = new Date(nextAgentRunAt(at(7), 30 * 60 * 1000));
    expect(next.getDate()).toBe(14);
    expect(next.getHours()).toBe(9);
  });
});

describe('설정과 상태', () => {
  it('기본은 켜짐 · 30분이고, 끄면 저장된다', () => {
    expect(getMallAgentLoopState().settings).toEqual({
      enabled: true,
      intervalMin: AGENT_LOOP_DEFAULT_INTERVAL_MIN,
    });
    setMallAgentLoopEnabled(false);
    expect(getMallAgentLoopState().settings.enabled).toBe(false);
    expect(window.localStorage.getItem('kiditem.mall-agent-loop.v1')).toContain('"enabled":false');
  });

  it('모르는 간격은 무시한다', () => {
    setMallAgentLoopInterval(7);
    expect(getMallAgentLoopState().settings.intervalMin).toBe(AGENT_LOOP_DEFAULT_INTERVAL_MIN);
    setMallAgentLoopInterval(15);
    expect(getMallAgentLoopState().settings.intervalMin).toBe(15);
  });

  it('⭐ 구독자는 상태가 바뀔 때마다 듣는다 — 화면과 러너가 같은 값을 본다', () => {
    let calls = 0;
    const unsubscribe = subscribeMallAgentLoop(() => {
      calls += 1;
    });
    requestMallAgentLoopRun();
    expect(getMallAgentLoopState().runRequest).toBe(1);
    markMallAgentLoopFinished('로그인 확인 9곳 · 주문수집 3곳', at(10), at(10, 30));
    expect(getMallAgentLoopState()).toMatchObject({
      step: 'idle',
      lastSummary: '로그인 확인 9곳 · 주문수집 3곳',
      lastRunAt: at(10),
      nextRunAt: at(10, 30),
    });
    expect(calls).toBe(2);
    unsubscribe();
  });
});

describe('새로고침해도 일정은 그대로', () => {
  const INTERVAL_MS = 30 * 60 * 1000;

  /**
   * 전에는 일정을 저장하지 않아, 화면을 새로 열 때마다 20초 뒤 한 바퀴가 새로 돌았다.
   * 새로고침 다섯 번이면 몰을 다섯 번 두드리는 셈이었다.
   */
  it('⭐ 저장된 다음 바퀴가 아직 안 왔으면 그대로 기다린다 — 새로고침이 바퀴를 앞당기지 않는다', () => {
    const now = at(10);
    seedMallAgentLoopScheduleForTest({ lastRunAt: at(9, 50), nextRunAt: at(10, 20) });
    expect(resolveMallAgentLoopStartAt(now, INTERVAL_MS)).toBe(at(10, 20));
  });

  it('일정이 이미 지났으면 잠깐 뒤에 돈다', () => {
    const now = at(11);
    seedMallAgentLoopScheduleForTest({ lastRunAt: at(10), nextRunAt: at(10, 30) });
    expect(resolveMallAgentLoopStartAt(now, INTERVAL_MS)).toBe(now + AGENT_LOOP_FIRST_RUN_DELAY_MS);
  });

  /** 일정이 없어졌어도 마지막 바퀴로부터 한 간격은 반드시 띄운다. */
  it('⭐ 일정이 사라져도 방금 돈 바퀴 뒤에 바로 또 돌지 않는다', () => {
    const now = at(10, 1);
    seedMallAgentLoopScheduleForTest({ lastRunAt: at(10), nextRunAt: null });
    expect(resolveMallAgentLoopStartAt(now, INTERVAL_MS)).toBe(at(10, 30));
  });

  it('한 번도 안 돌았으면 잠깐 뒤 첫 바퀴', () => {
    const now = at(10);
    expect(resolveMallAgentLoopStartAt(now, INTERVAL_MS)).toBe(now + AGENT_LOOP_FIRST_RUN_DELAY_MS);
  });

  it('바퀴가 끝나면 일정이 저장돼 다음에 열 때 이어진다', () => {
    markMallAgentLoopFinished('한 바퀴 완료', at(10), at(10, 30));
    resetMallAgentLoopForTest();
    expect(getMallAgentLoopState()).toMatchObject({ lastRunAt: at(10), nextRunAt: at(10, 30) });
  });
});
