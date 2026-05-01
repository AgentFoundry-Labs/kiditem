import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { ResultCleanupService } from '../lifecycle/result-cleanup.service';

// ── Mock Prisma ──

function makePrisma() {
  return {
    heartbeatRun: {
      findMany: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    agentDefinition: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

function makeService(prisma?: any) {
  const p = prisma ?? makePrisma();
  return { service: new ResultCleanupService(p as any), prisma: p };
}

// ── generateSummary ──

describe('ResultCleanupService.generateSummary', () => {
  const { service } = makeService();

  it('error run → "실패: {errorCode}"', () => {
    expect(service.generateSummary(null, 'process_error')).toBe('실패: process_error');
  });

  it('actions array → "N개 액션 실행: {types}"', () => {
    const result = service.generateSummary(
      { actions: [{ action: 'create_ad' }, { action: 'update_bid' }, { action: 'create_ad' }] },
      null,
    );
    expect(result).toBe('3개 액션 실행: create_ad, update_bid');
  });

  it('empty resultJson object → "정상 실행 완료 (빈 결과)"', () => {
    expect(service.generateSummary({}, null)).toBe('정상 실행 완료 (빈 결과)');
  });

  it('null resultJson → "정상 실행 완료"', () => {
    expect(service.generateSummary(null, null)).toBe('정상 실행 완료');
  });

  it('multiple keys > 3 → "정상 실행 완료: key1, key2, key3 외 N건"', () => {
    const result = service.generateSummary(
      { a: 1, b: 2, c: 3, d: 4, e: 5 },
      null,
    );
    expect(result).toBe('정상 실행 완료: a, b, c 외 2건');
  });

  it('3 keys exactly → no trailing "외 N건"', () => {
    const result = service.generateSummary({ x: 1, y: 2, z: 3 }, null);
    expect(result).toBe('정상 실행 완료: x, y, z');
  });

  it('nextSchedule-only key is filtered out → treated as empty', () => {
    expect(service.generateSummary({ nextSchedule: '0 9 * * *' }, null)).toBe(
      '정상 실행 완료 (빈 결과)',
    );
  });
});

// ── cleanupAgent ──

describe('ResultCleanupService.cleanupAgent', () => {
  const AGENT_ID = 'agent-1';
  const RETENTION_DAYS = 30;

  it('no old runs → returns 0, no updates', async () => {
    const { service, prisma } = makeService();
    prisma.heartbeatRun.findMany.mockResolvedValue([]);

    const count = await service.cleanupAgent(AGENT_ID, RETENTION_DAYS);

    expect(count).toBe(0);
    expect(prisma.heartbeatRun.updateMany).not.toHaveBeenCalled();
  });

  it('old run → summarized + excerpts cleared', async () => {
    const { service, prisma } = makeService();
    const oldRun = {
      id: 'run-old-1',
      organizationId: 'co-1',
      resultJson: { actions: [{ action: 'bid_adjust' }] },
      errorCode: null,
    };
    prisma.heartbeatRun.findMany.mockResolvedValue([oldRun]);

    const count = await service.cleanupAgent(AGENT_ID, RETENTION_DAYS);

    expect(count).toBe(1);
    expect(prisma.heartbeatRun.updateMany).toHaveBeenCalledWith({
      where: { id: 'run-old-1', organizationId: 'co-1' },
      data: {
        isSummarized: true,
        summary: '1개 액션 실행: bid_adjust',
        stdoutExcerpt: null,
        stderrExcerpt: null,
        resultJson: Prisma.JsonNull,
      },
    });
  });

  it('already summarized run → not returned by query', async () => {
    const { service, prisma } = makeService();
    // findMany already filters isSummarized: false, so already-summarized runs don't appear
    prisma.heartbeatRun.findMany.mockResolvedValue([]);

    const count = await service.cleanupAgent(AGENT_ID, RETENTION_DAYS);

    expect(count).toBe(0);
  });

  it('recent run within retention → findMany uses cutoff filter', async () => {
    const { service, prisma } = makeService();
    prisma.heartbeatRun.findMany.mockResolvedValue([]);

    await service.cleanupAgent(AGENT_ID, RETENTION_DAYS);

    const call = prisma.heartbeatRun.findMany.mock.calls[0][0];
    expect(call.where.isSummarized).toBe(false);
    expect(call.where.status).toEqual({ not: 'running' });
    expect(call.where.finishedAt.lt).toBeInstanceOf(Date);
  });
});

// ── cleanupAll ──

describe('ResultCleanupService.cleanupAll', () => {
  it('processes all active agents and returns totals', async () => {
    const { service, prisma } = makeService();
    prisma.agentDefinition.findMany.mockResolvedValue([
      { id: 'agent-1', resultRetentionDays: 30 },
      { id: 'agent-2', resultRetentionDays: 7 },
    ]);

    // agent-1 has 2 old runs, agent-2 has none
    prisma.heartbeatRun.findMany
      .mockResolvedValueOnce([
        { id: 'run-1', organizationId: 'co-1', resultJson: null, errorCode: null },
        { id: 'run-2', organizationId: 'co-1', resultJson: null, errorCode: 'timeout' },
      ])
      .mockResolvedValueOnce([]);

    const result = await service.cleanupAll();

    expect(result.processed).toBe(2);
    expect(result.summarized).toBe(2);
  });
});
