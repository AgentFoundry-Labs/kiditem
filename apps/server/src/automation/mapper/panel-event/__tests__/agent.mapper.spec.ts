import { describe, it, expect } from 'vitest';
import { PanelRunItem } from '@kiditem/shared/panel';
import { agentPanelMapper, AgentAdapterInput } from '../agent.mapper';
import type { HeartbeatRun } from '@prisma/client';

const RUN_ID = '11111111-1111-1111-1111-111111111111';
const AGENT_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = '33333333-3333-3333-3333-333333333333';
const CO_ID = '44444444-4444-4444-4444-444444444444';

const baseRun: HeartbeatRun = {
  id: RUN_ID,
  companyId: CO_ID,
  agentId: AGENT_ID,
  invocationSource: 'on_demand',
  triggerDetail: null,
  status: 'running',
  failureType: null,
  startedAt: new Date('2026-04-15T01:00:00Z'),
  finishedAt: null,
  error: null,
  exitCode: null,
  signal: null,
  usageJson: null,
  resultJson: null,
  sessionIdBefore: null,
  sessionIdAfter: null,
  stdoutExcerpt: null,
  stderrExcerpt: null,
  errorCode: null,
  processPid: null,
  wakeupRequestId: null,
  nextSchedule: null,
  isSummarized: false,
  summary: null,
  triggeredByUserId: USER_ID,
  createdAt: new Date('2026-04-15T00:00:00Z'),
  updatedAt: new Date('2026-04-15T01:00:00Z'),
};

const baseAgent = { id: AGENT_ID, name: '소싱 에이전트' };

const makeInput = (overrides: Partial<HeartbeatRun> = {}): AgentAdapterInput => ({
  run: { ...baseRun, ...overrides },
  agent: baseAgent,
});

describe('agentPanelMapper', () => {
  it.each(['pending', 'running', 'succeeded', 'failed', 'cancelled'] as const)(
    'passes through canonical status "%s"',
    (status) => {
      const item = agentPanelMapper.mapToItem(makeInput({ status }), 'co-1');
      expect(item.status).toBe(status);
    },
  );

  it('surfaces failureType as-is when present', () => {
    const item = agentPanelMapper.mapToItem(
      makeInput({ status: 'failed', failureType: 'timeout' }),
      'co-1',
    );
    expect(item.failureType).toBe('timeout');
  });

  it('surfaces failureType: null when absent', () => {
    const item = agentPanelMapper.mapToItem(makeInput({ failureType: null }), 'co-1');
    expect(item.failureType).toBeNull();
  });

  it('triggeredByUserId: null maps to actorUserId: null and visibility: company', () => {
    const item = agentPanelMapper.mapToItem(
      makeInput({ triggeredByUserId: null }),
      'co-1',
    );
    expect(item.actorUserId).toBeNull();
    expect(item.visibility).toBe('company');
  });

  it('triggeredByUserId uuid maps to actorUserId and visibility: user', () => {
    const item = agentPanelMapper.mapToItem(makeInput({ triggeredByUserId: USER_ID }), 'co-1');
    expect(item.actorUserId).toBe(USER_ID);
    expect(item.visibility).toBe('user');
  });

  it('throws on invalid (non-canonical) status', () => {
    expect(() =>
      agentPanelMapper.mapToItem(makeInput({ status: 'queued' }), 'co-1'),
    ).toThrow(/unknown status "queued"/);
  });

  it('output passes PanelRunItemSchema validation', () => {
    const item = agentPanelMapper.mapToItem(makeInput({ status: 'succeeded' }), 'co-1');
    const result = PanelRunItem.omit({ seq: true, updatedAt: true }).safeParse(item);
    expect(result.success).toBe(true);
  });

  it('maps id with agent: prefix', () => {
    const item = agentPanelMapper.mapToItem(makeInput(), 'co-1');
    expect(item.id).toBe(`agent:${RUN_ID}`);
    expect(item.sourceId).toBe(RUN_ID);
  });

  it('phase is null for agent source', () => {
    const item = agentPanelMapper.mapToItem(makeInput(), 'co-1');
    expect(item.phase).toBeNull();
  });
});
