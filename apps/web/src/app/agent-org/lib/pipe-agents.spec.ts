import { describe, expect, it } from 'vitest';
import { buildPipeAgents, countAgentHealth } from './pipe-agents';
import { DIAGRAM_AGENTS } from './pipe-diagram-layout';
import { buildPipeSnapshot, type PipeInputs } from './pipe-model';

const NOW = Date.parse('2026-09-13T06:00:00.000Z');

function inputs(overrides: Partial<PipeInputs> = {}): PipeInputs {
  return {
    now: NOW,
    runs: { data: [], failed: false },
    outcomes: { data: [], failed: false },
    malls: { data: [{ key: 'gs-shop', name: 'GS샵', enabled: true }], failed: false },
    freshness: { data: null, failed: false },
    confirm: { data: null, failed: false },
    panelItems: [],
    loginBlocks: [],
    ...overrides,
  };
}

const agent = (agents: ReturnType<typeof buildPipeAgents>, id: string) => agents.find((entry) => entry.group.id === id)!;

describe('에이전트 목록', () => {
  it('⭐ 다이어그램의 에이전트 묶음마다 하나씩, 같은 순서로 선다', () => {
    const agents = buildPipeAgents(buildPipeSnapshot(inputs()));
    expect(agents.map((entry) => entry.group.id)).toEqual(DIAGRAM_AGENTS.map((entry) => entry.id));
    expect(agent(agents, 'product').stageIds).toEqual(['register', 'content']);
  });

  it('⭐ 기록이 없으면 모름이다 — 정상으로 칠하지 않는다', () => {
    const agents = buildPipeAgents(buildPipeSnapshot(inputs()));
    expect(agent(agents, 'cs')).toMatchObject({ state: 'unknown', health: 'unknown', attention: 0 });
  });

  it('⭐ 사장님 컨펌에 기다리는 후보가 있으면 확인 필요로 서고, 걸린 일 수를 센다', () => {
    const agents = buildPipeAgents(
      buildPipeSnapshot(
        inputs({
          confirm: {
            data: { runId: 'run-1', generatedAt: new Date(NOW - 60_000).toISOString(), total: 4, pending: 2, approved: 2, rejected: 0, lastReportAt: null },
            failed: false,
          },
        }),
      ),
    );
    expect(agent(agents, 'owner')).toMatchObject({ state: 'waiting_human', health: 'attention', attention: 1 });
  });

  it('쇼핑몰 에이전트는 로그인이 필요한 몰이 있으면 그것까지 본다', () => {
    const snapshot = buildPipeSnapshot(inputs());
    const withLogin = { ...snapshot, connectors: { ...snapshot.connectors, needsLogin: 2 } };
    expect(agent(buildPipeAgents(withLogin), 'mall')).toMatchObject({
      state: 'blocked_external',
      reason: '로그인이 필요한 몰 2곳',
    });
  });

  it('상태 네 갈래로 센다', () => {
    const agents = buildPipeAgents(buildPipeSnapshot(inputs()));
    const counts = countAgentHealth(agents);
    expect(counts.working + counts.attention + counts.ok + counts.unknown).toBe(agents.length);
  });
});
