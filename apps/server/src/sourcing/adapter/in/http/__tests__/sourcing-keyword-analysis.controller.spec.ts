import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { SourcingKeywordAnalysisController } from '../sourcing-keyword-analysis.controller';

describe('SourcingKeywordAnalysisController', () => {
  it('keeps the keyword-analysis GET as an exact persisted snapshot read', async () => {
    const getAnalysisSnapshot = vi.fn().mockResolvedValue({ generatedAt: '2026-08-14T00:00:00.000Z' });
    const controller = new SourcingKeywordAnalysisController({ getAnalysisSnapshot } as never);
    const input = {
      action: 'related',
      keyword: '슬라임',
      timeUnit: 'date',
      gender: 'all',
      age: 'all',
      device: 'all',
      selectedBoardKey: 'all',
      rankLimit: 20,
      focusMode: 'all',
      finalLimit: 30,
    };

    await expect(controller.snapshot(JSON.stringify(input), 'org-a'))
      .resolves.toEqual({ generatedAt: '2026-08-14T00:00:00.000Z' });
    expect(getAnalysisSnapshot).toHaveBeenCalledWith('org-a', input);
  });

  it('rejects malformed query input instead of turning the read into a provider action', () => {
    const controller = new SourcingKeywordAnalysisController({ getAnalysisSnapshot: vi.fn() } as never);

    expect(() => controller.snapshot('{', 'org-a')).toThrow(BadRequestException);
  });
});
