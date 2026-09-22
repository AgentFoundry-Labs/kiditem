import { describe, expect, it } from 'vitest';
import type { CapabilityTotals } from '../../_shared/mall-capabilities';
import { MALL_AGENT_PRINCIPLES, buildMallAgentMissions } from './mall-agent-missions';

const totals = (overrides: Partial<CapabilityTotals> = {}): CapabilityTotals => ({
  orders: { ready: 13, pending: 16, unavailable: 0 },
  tracking: { ready: 3, pending: 26, unavailable: 0 },
  register: { ready: 14, pending: 13, unavailable: 2 },
  soldout: { ready: 0, pending: 27, unavailable: 2 },
  ...overrides,
});

describe('buildMallAgentMissions', () => {
  /** 사장님이 준 네 가지(2026-09-11)는 빠지지도, 순서가 바뀌지도 않는다. */
  it('⭐ 사장님이 준 미션 넷이 맨 앞에 그 순서로 선다', () => {
    const missions = buildMallAgentMissions(totals());
    expect(missions.slice(0, 4).map((mission) => [mission.id, mission.origin])).toEqual([
      ['form-self-heal', 'owner'],
      ['mall-notices', 'owner'],
      ['incident-report', 'owner'],
      ['learning-loop', 'owner'],
    ]);
    expect(missions[0]?.goal).toContain('AI 가 폼을 다시 분석');
    expect(missions[1]?.goal).toContain('공지사항');
    expect(missions[2]?.goal).toContain('바로 알린다');
    expect(missions[3]?.goal).toContain('강화학습');
  });

  it('더한 미션은 에이전트 제안으로 표시한다', () => {
    const added = buildMallAgentMissions(totals()).slice(4);
    expect(added.length).toBeGreaterThan(0);
    for (const mission of added) expect(mission.origin).toBe('agent');
  });

  /** 되는 것처럼 칠하지 않는다. 지금 코드에 없는 일은 '아직' 이다. */
  it('⭐ 아직 없는 일은 아직이다 — 폼 자가복구 · 공지 · 규정 점검 · 정산', () => {
    const byId = new Map(buildMallAgentMissions(totals()).map((mission) => [mission.id, mission]));
    for (const id of ['form-self-heal', 'mall-notices', 'preflight', 'settlement']) {
      expect(byId.get(id)?.status).toBe('todo');
    }
    // 기억(몰 작업 결과 기록)이 생겨 학습 미션은 재료가 쌓이기 시작했다 — 학습 자체는 아직이다.
    expect(byId.get('learning-loop')?.status).toBe('progress');
    expect(buildMallAgentMissions(totals()).some((mission) => mission.status === 'done')).toBe(false);
  });

  it('되는 일 넷의 숫자는 쇼핑몰 현황과 같은 판정에서 읽는다', () => {
    const coverage = buildMallAgentMissions(totals()).find((mission) => mission.id === 'coverage');
    expect(coverage?.now).toBe('주문수집 13/29곳 · 송장전송 3/29곳 · 상품등록 14/29곳 · 품절관리 0/29곳');
    expect(coverage?.status).toBe('progress');
  });

  it('클레임·문의는 아직 어느 몰에서도 가져오지 않는다고 말한다', () => {
    const orders = buildMallAgentMissions(totals()).find((mission) => mission.id === 'orders');
    expect(orders?.now).toBe('주문수집은 13/29곳에서 된다. 취소·반품·교환·문의를 따로 가져오는 몰은 아직 없다.');
  });

  it('품절 송신 경로가 생기면 품절 미션이 진행 중이 된다', () => {
    const before = buildMallAgentMissions(totals()).find((mission) => mission.id === 'soldout');
    expect(before?.status).toBe('todo');
    const after = buildMallAgentMissions(totals({ soldout: { ready: 1, pending: 26, unavailable: 2 } }))
      .find((mission) => mission.id === 'soldout');
    expect(after?.status).toBe('progress');
  });

  it('회색이 하나도 없으면 되는 일 넷 미션은 다 된 것이다 — 빨강은 할 일이 아니다', () => {
    const all = buildMallAgentMissions(totals({
      orders: { ready: 29, pending: 0, unavailable: 0 },
      tracking: { ready: 29, pending: 0, unavailable: 0 },
      register: { ready: 27, pending: 0, unavailable: 2 },
      soldout: { ready: 27, pending: 0, unavailable: 2 },
    })).find((mission) => mission.id === 'coverage');
    expect(all?.status).toBe('done');
  });

  it('숫자를 아직 못 받았으면 지어내지 않는다', () => {
    const coverage = buildMallAgentMissions(null).find((mission) => mission.id === 'coverage');
    expect(coverage?.now).toBe('숫자를 불러오는 중입니다.');
  });
});

describe('MALL_AGENT_PRINCIPLES', () => {
  it('되돌리기 어려운 일은 사람이 누르고, 비밀번호는 남기지 않는다', () => {
    const text = MALL_AGENT_PRINCIPLES.join(' ');
    expect(text).toContain('사람이 누른다');
    expect(text).toContain('비밀번호는 코드·기록·알림 어디에도 남기지 않는다');
  });
});
