import { describe, expect, it } from 'vitest';
import type { ThumbnailExecutionStatus } from '@kiditem/shared/thumbnail-execution';
import { mergeThumbnailRegistration, thumbnailExecutionIdChunks } from './thumbnail-registration';

const status = (generationId: string, patch: Partial<ThumbnailExecutionStatus>): ThumbnailExecutionStatus => ({
  generationId,
  executionId: `${generationId}-execution`,
  status: 'succeeded',
  providerOutcome: 'succeeded',
  checkedAt: '2026-09-23T01:00:00.000Z',
  error: null,
  screenshotPath: null,
  ...patch,
});

describe('mergeThumbnailRegistration', () => {
  it('attaches each generation its latest Channels execution by generation id', () => {
    const merged = mergeThumbnailRegistration(
      [{ id: 'g1' }, { id: 'g2' }, { id: 'g3' }, { id: 'g4' }],
      [
        status('g1', {}),
        status('g2', { status: 'failed', providerOutcome: 'definitive_failure', error: '로그인 필요' }),
        status('g3', { status: 'reconciling', providerOutcome: 'uncertain', error: 'port closed' }),
      ],
    );

    expect(merged).toEqual([
      { id: 'g1', registrationExecutionId: 'g1-execution', registrationStatus: 'registered', registrationError: null, registrationCheckedAt: '2026-09-23T01:00:00.000Z' },
      { id: 'g2', registrationExecutionId: 'g2-execution', registrationStatus: 'failed', registrationError: '로그인 필요', registrationCheckedAt: '2026-09-23T01:00:00.000Z' },
      { id: 'g3', registrationExecutionId: 'g3-execution', registrationStatus: 'checking', registrationError: 'port closed', registrationCheckedAt: '2026-09-23T01:00:00.000Z' },
      { id: 'g4', registrationExecutionId: null, registrationStatus: null, registrationError: null, registrationCheckedAt: null },
    ]);
  });
});

describe('thumbnailExecutionIdChunks', () => {
  it('splits the listed ids into the 200-id pages the Channels read accepts, without duplicates', () => {
    const ids = Array.from({ length: 450 }, (_, index) => `g${index}`);
    const chunks = thumbnailExecutionIdChunks([...ids, 'g0']);
    expect(chunks.map((chunk) => chunk.length)).toEqual([200, 200, 50]);
    expect(chunks.flat()).toEqual(ids);
  });
});
