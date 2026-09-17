import { afterEach, describe, expect, it } from 'vitest';
import {
  AGENT_LOOP_DEFAULT_INTERVAL_MIN,
  getMallAgentLoopState,
  isWithinAgentBusinessHours,
  markMallAgentLoopFinished,
  nextAgentRunAt,
  requestMallAgentLoopRun,
  resetMallAgentLoopForTest,
  seedMallAgentLoopScheduleForTest,
  setMallAgentLoopEnabled,
  setMallAgentLoopInterval,
  subscribeMallAgentLoop,
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
  /** KID-106 Q1. 앱을 열었다고 스스로 돌지 않는다 — 운영자가 이 탭에서 시작해야 돈다. */
  it('⭐ 기본은 꺼짐 · 30분이고, 시작은 이 탭에만 있다 — 저장하지 않는다', () => {
    expect(getMallAgentLoopState().settings).toEqual({
      enabled: false,
      intervalMin: AGENT_LOOP_DEFAULT_INTERVAL_MIN,
    });
    setMallAgentLoopEnabled(true);
    expect(getMallAgentLoopState().settings.enabled).toBe(true);
    expect(window.localStorage.getItem('kiditem.mall-agent-loop.v1')).toBeNull();
  });

  it('⭐ 예전에 켜짐으로 저장됐어도 새로 연 탭은 꺼진 채로 선다', () => {
    window.localStorage.setItem('kiditem.mall-agent-loop.v1', JSON.stringify({ enabled: true, intervalMin: 15 }));
    expect(getMallAgentLoopState().settings).toEqual({ enabled: false, intervalMin: 15 });
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

describe('다시 연 탭', () => {
  /** 저장된 다음 바퀴가 있어도 운영자가 시작하기 전에는 돌 시각이 없다. */
  it('⭐ 저장된 다음 바퀴는 버리고 마지막 한 바퀴만 보여 준다', () => {
    seedMallAgentLoopScheduleForTest({ lastRunAt: at(9, 50), nextRunAt: at(10, 20), lastSummary: '한 바퀴 완료' });
    expect(getMallAgentLoopState()).toMatchObject({
      lastRunAt: at(9, 50),
      nextRunAt: null,
      lastSummary: '한 바퀴 완료',
    });
  });

  it('바퀴가 끝나면 마지막 한 바퀴가 저장돼 다음에 열 때 보인다', () => {
    markMallAgentLoopFinished('한 바퀴 완료', at(10), at(10, 30));
    resetMallAgentLoopForTest();
    expect(getMallAgentLoopState()).toMatchObject({ lastRunAt: at(10), lastSummary: '한 바퀴 완료', nextRunAt: null });
  });
});
