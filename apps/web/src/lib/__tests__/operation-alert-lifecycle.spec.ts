import { describe, expect, it } from 'vitest';
import {
  classifyBatchScrapeStatus,
  summarizeBatchScrapeProgress,
} from '../operation-alert-lifecycle';

describe('operation alert lifecycle helpers', () => {
  it('summarizes progress from completed and failed counts', () => {
    expect(
      summarizeBatchScrapeProgress(
        { completed: 2, failed: 1, total: 4 },
        10,
      ),
    ).toEqual({
      ok: 2,
      fail: 1,
      total: 4,
      progress: 0.75,
    });
  });

  it('falls back to current page progress before completed counts advance', () => {
    expect(
      summarizeBatchScrapeProgress(
        { current: 3, completed: 0, failed: 0 },
        5,
      ).progress,
    ).toBe(0.4);
  });

  it('classifies terminal states without turning partial failure into hard failure', () => {
    expect(classifyBatchScrapeStatus({ status: 'cancelled' })).toBe('cancelled');
    expect(classifyBatchScrapeStatus({ status: 'error' })).toBe('failed');
    expect(classifyBatchScrapeStatus({ status: 'done', failed: 0 })).toBe('succeeded');
    expect(classifyBatchScrapeStatus({ status: 'idle', failed: 0 })).toBe('succeeded');
    expect(classifyBatchScrapeStatus({ status: 'done', failed: 2 })).toBe('warning');
    expect(classifyBatchScrapeStatus({ status: 'running' })).toBe(null);
  });
});
