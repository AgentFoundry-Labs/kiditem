import { describe, expect, it } from 'vitest';
import type { CapabilityTotals } from '../../_shared/mall-capabilities';
import { PIPELINE_UNKNOWN, buildAgentPipeline, type AgentPipelineInput } from './agent-pipeline';
import { buildMallAgentMissions } from './mall-agent-missions';

const totals: CapabilityTotals = {
  orders: { ready: 13, pending: 16, unavailable: 0 },
  tracking: { ready: 3, pending: 26, unavailable: 0 },
  register: { ready: 14, pending: 13, unavailable: 2 },
  soldout: { ready: 0, pending: 27, unavailable: 2 },
};

const input = (overrides: Partial<AgentPipelineInput> = {}): AgentPipelineInput => ({
  missions: buildMallAgentMissions(totals),
  alerts: { total: 25, attention: 25 },
  noLoginCount: 2,
  sessions: { signedIn: 6, signedOut: 2, unknown: 21 },
  soldOutTotal: 387,
  coupangPendingAccept: 0,
  openAlertCount: 0,
  totals,
  outcomes: { total: 12, malls: 3, loginRecords: 2 },
  ...overrides,
});

function stageOf(key: string, overrides: Partial<AgentPipelineInput> = {}) {
  const found = buildAgentPipeline(input(overrides)).find((stage) => stage.key === key);
  if (!found) throw new Error(`stage ${key} missing`);
  return found;
}

function itemOf(stageKey: string, itemId: string, overrides: Partial<AgentPipelineInput> = {}) {
  const found = stageOf(stageKey, overrides).items.find((item) => item.id === itemId);
  if (!found) throw new Error(`item ${itemId} missing`);
  return found;
}

describe('buildAgentPipeline', () => {
  it('⭐ 일이 흐르는 순서 — 미션 → 감지 → 판단 → 도구 → 사람 승인 → 기억', () => {
    expect(buildAgentPipeline(input()).map((stage) => stage.name)).toEqual([
      '미션',
      '감지',
      '판단',
      '도구',
      '사람 승인',
      '기억',
    ]);
  });

  /** 되는 것처럼 칠하지 않는다. 판단은 지금 코드에 없고 사람이 대신한다. */
  it('⭐ 판단은 아직 — 아래 일이 모두 아직이고, AI 판단이 붙을 곳을 적는다', () => {
    const decide = stageOf('decide');
    expect(decide.status).toBe('todo');
    expect(decide.items.every((item) => item.status === 'todo')).toBe(true);
    expect(decide.note).toContain('Agent OS');
  });

  it('단계 상태는 아래 일들을 모은 것이다', () => {
    const mission = stageOf('mission');
    expect(mission.status).toBe('progress');
    expect(mission.tally).toBe('10개 · 진행 중 5 · 아직 5');
    expect(stageOf('sense').tally).toBe('10개 · 됨 5 · 일부 3 · 아직 2');
    expect(stageOf('remember').tally).toBe('6개 · 됨 3 · 일부 1 · 아직 2');
    for (const key of ['sense', 'act', 'approve', 'remember']) {
      expect(stageOf(key).status).toBe('progress');
    }
  });

  it('감지 · 도구 칸은 홈의 다른 칸과 같은 숫자를 쓴다', () => {
    expect(itemOf('sense', 'sense-work').detail).toBe('알림 25건 · 확인 필요 25건');
    expect(itemOf('sense', 'sense-login').detail).toBe('2곳');
    expect(itemOf('sense', 'sense-session').detail).toBe('로그인됨 6 · 로그인 필요 2 · 확인 불가 21곳');
    expect(itemOf('sense', 'sense-soldout').detail).toBe('387개 — 판매 가능 재고 0');
    expect(itemOf('act', 'act-orders').detail).toBe('29곳 중 13곳');
    expect(itemOf('act', 'act-register').detail).toBe('29곳 중 14곳 · 제출은 사람이');
    const soldOut = itemOf('act', 'act-soldout');
    expect(soldOut.status).toBe('todo');
    expect(soldOut.detail).toBe('29곳 중 0곳');
  });

  /** 확장은 조용히 확인할 수 있는 몰만 안다. 나머지는 확인 불가라 이 일은 일부다. */
  it('⭐ 몰 로그인 상태 — 조용히 확인할 수 있는 몰만 알아 일부다', () => {
    const session = itemOf('sense', 'sense-session');
    expect(session.status).toBe('progress');
    expect(session.href).toEqual({ path: '#mall-status', label: '몰별 상태' });
  });

  it('⭐ 못 받은 숫자는 지어내지 않는다', () => {
    const unknown = {
      alerts: null,
      noLoginCount: null,
      sessions: null,
      soldOutTotal: null,
      coupangPendingAccept: null,
      openAlertCount: null,
      totals: null,
      outcomes: null,
    };
    for (const id of ['sense-work', 'sense-login', 'sense-session', 'sense-soldout', 'sense-coupang', 'sense-open-alerts']) {
      expect(itemOf('sense', id, unknown).detail).toBe(PIPELINE_UNKNOWN);
    }
    expect(itemOf('act', 'act-orders', unknown).detail).toBe(PIPELINE_UNKNOWN);
    expect(itemOf('remember', 'remember-results', unknown).detail).toBe(PIPELINE_UNKNOWN);
  });

  /** 기억이 생겼다 — 몰 작업 결과와 로그인 결과가 몰별로 쌓인다. 사람이 고친 칸은 아직. */
  it('⭐ 기억 — 몰 작업 결과를 쌓고, 사람이 고친 칸은 아직이다', () => {
    const results = itemOf('remember', 'remember-results');
    expect(results.status).toBe('done');
    expect(results.detail).toBe('최근 7일 12건 · 몰 3곳');
    expect(itemOf('remember', 'remember-login').detail).toBe('최근 7일 로그인 기록 2건');
    expect(itemOf('remember', 'remember-values').status).toBe('done');
    expect(itemOf('remember', 'remember-fixes').status).toBe('todo');
  });
});
