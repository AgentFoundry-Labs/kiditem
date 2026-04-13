import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CompressorService } from '../context-manager/compressor.service';

// ── Mock Prisma ──

function makePrisma() {
  return {
    heartbeatRun: {
      findMany: vi.fn(),
    },
  };
}

function makeService(prisma?: any) {
  const p = prisma ?? makePrisma();
  return { service: new CompressorService(p as any), prisma: p };
}

function makeRun(overrides: Partial<{
  finishedAt: Date | null;
  status: string;
  resultJson: unknown;
  summary: string | null;
  isSummarized: boolean;
  errorCode: string | null;
}> = {}) {
  return {
    finishedAt: new Date('2026-04-01T10:00:00Z'),
    status: 'succeeded',
    resultJson: { actions: [{ action: 'bid_adjust' }] },
    summary: null,
    isSummarized: false,
    errorCode: null,
    ...overrides,
  };
}

describe('CompressorService.buildCompressedContext', () => {
  it('empty history → empty string', async () => {
    const { service, prisma } = makeService();
    prisma.heartbeatRun.findMany.mockResolvedValue([]);

    const result = await service.buildCompressedContext('agent-1');

    expect(result).toBe('');
  });

  it('3 recent runs → full detail in output with header', async () => {
    const { service, prisma } = makeService();
    prisma.heartbeatRun.findMany.mockResolvedValue([
      makeRun({ finishedAt: new Date('2026-04-03T10:00:00Z') }),
      makeRun({ finishedAt: new Date('2026-04-02T10:00:00Z') }),
      makeRun({ finishedAt: new Date('2026-04-01T10:00:00Z') }),
    ]);

    const result = await service.buildCompressedContext('agent-1');

    expect(result).toContain('=== 최근 실행 이력 ===');
    expect(result).toContain('[1]');
    expect(result).toContain('[2]');
    expect(result).toContain('[3]');
    // No Layer 2 section since there are only 3 runs
    expect(result).not.toContain('---');
    // Full JSON present for non-summarized runs
    expect(result).toContain('bid_adjust');
  });

  it('5 runs → 3 full + summary for runs 4-5', async () => {
    const { service, prisma } = makeService();
    prisma.heartbeatRun.findMany.mockResolvedValue([
      makeRun({ finishedAt: new Date('2026-04-05T10:00:00Z') }),
      makeRun({ finishedAt: new Date('2026-04-04T10:00:00Z') }),
      makeRun({ finishedAt: new Date('2026-04-03T10:00:00Z') }),
      makeRun({ finishedAt: new Date('2026-04-02T10:00:00Z'), summary: '이전 요약 A' }),
      makeRun({ finishedAt: new Date('2026-04-01T10:00:00Z'), status: 'failed', errorCode: 'timeout' }),
    ]);

    const result = await service.buildCompressedContext('agent-1');

    expect(result).toContain('[1]');
    expect(result).toContain('[3]');
    expect(result).toContain('---');
    expect(result).toContain('[4-5]');
    expect(result).toContain('2회 실행');
    expect(result).toContain('1회 성공');
    expect(result).toContain('이전 요약 A');
  });

  it('token budget exceeded → result truncated', async () => {
    const { service, prisma } = makeService();
    // Create a run with very large resultJson
    const bigJson = { data: 'x'.repeat(50000) };
    prisma.heartbeatRun.findMany.mockResolvedValue([
      makeRun({ resultJson: bigJson }),
    ]);

    // maxTokens=10 → maxChars=40
    const result = await service.buildCompressedContext('agent-1', 10);

    expect(result.length).toBeLessThanOrEqual(40);
    expect(result.endsWith('...')).toBe(true);
  });

  it('summarized run → uses summary field instead of resultJson', async () => {
    const { service, prisma } = makeService();
    prisma.heartbeatRun.findMany.mockResolvedValue([
      makeRun({
        isSummarized: true,
        resultJson: null,
        summary: '3개 액션 실행: bid_adjust',
      }),
    ]);

    const result = await service.buildCompressedContext('agent-1');

    expect(result).toContain('3개 액션 실행: bid_adjust');
    // Full JSON should not appear since summarized
    expect(result).not.toContain('"actions"');
  });

  it('run with null finishedAt → shows "?" for date', async () => {
    const { service, prisma } = makeService();
    prisma.heartbeatRun.findMany.mockResolvedValue([
      makeRun({ finishedAt: null }),
    ]);

    const result = await service.buildCompressedContext('agent-1');

    expect(result).toContain('?');
  });
});
