import { describe, expect, it, vi } from 'vitest';
import { dedupeDetailPageArtifacts } from '../data-migrations/v0.1.24/001_dedupe_detail_page_artifacts';

describe('dedupeDetailPageArtifacts', () => {
  it('runs before the unique constraint and reports every repointed reference', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ count: 2n }]),
      $executeRaw: vi.fn()
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(2),
    };

    await expect(
      dedupeDetailPageArtifacts.run(tx as never),
    ).resolves.toEqual({
      affectedRows: 12,
      details: {
        duplicateGroups: 2,
        artifactsRetired: 2,
        revisionsMoved: 4,
        referencesRepointed: 6,
      },
    });
    expect(dedupeDetailPageArtifacts).toMatchObject({
      id: 'v0.1.24:001_dedupe_detail_page_artifacts',
      releaseVersion: '0.1.24',
      phase: 'pre-schema',
    });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(7);
  });

  it('is a zero-row no-op after duplicates have already been retired', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ count: 0n }]),
      $executeRaw: vi.fn().mockResolvedValue(0),
    };

    await expect(
      dedupeDetailPageArtifacts.run(tx as never),
    ).resolves.toEqual({
      affectedRows: 0,
      details: {
        duplicateGroups: 0,
        artifactsRetired: 0,
        revisionsMoved: 0,
        referencesRepointed: 0,
      },
    });
  });
});
