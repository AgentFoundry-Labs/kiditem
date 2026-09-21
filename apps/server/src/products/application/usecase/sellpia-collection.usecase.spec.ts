import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { SellpiaCollectionAttempt } from '../port/in/sellpia-collection.port';
import { SellpiaCollectionUseCase } from './sellpia-collection.usecase';

const organizationId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';
const attemptId = '00000000-0000-4000-8000-000000000003';
const attemptToken = '00000000-0000-4000-8000-000000000004';

describe('SellpiaCollectionUseCase publication recovery', () => {
  it('returns the completed attempt when a concurrent publication already won', async () => {
    const file = Buffer.from('source artifact');
    const checksum = sha256(file);
    const running = attempt('RUNNING');
    const completed: SellpiaCollectionAttempt = {
      ...running,
      state: 'COMPLETE',
      contentChecksum: checksum,
      rowCount: 1,
    };
    const repository = {
      readAttempt: vi.fn()
        .mockResolvedValueOnce(running)
        .mockResolvedValueOnce(completed),
      failAttempt: vi.fn(),
    };
    const publication = {
      publishSnapshot: vi.fn().mockRejectedValue(new Error('publication raced')),
    };
    const service = makeService(repository, publication);

    await expect(service.completeAttempt(input(file))).resolves.toEqual(completed);
    expect(repository.failAttempt).not.toHaveBeenCalled();
    expect(publication.publishSnapshot).toHaveBeenCalledOnce();
  });

  it('preserves the publication error when terminal settlement fails', async () => {
    const file = Buffer.from('source artifact');
    const publicationError = new Error('publication unavailable');
    const repository = {
      readAttempt: vi.fn()
        .mockResolvedValueOnce(attempt('RUNNING'))
        .mockResolvedValueOnce(attempt('RUNNING')),
      failAttempt: vi.fn().mockRejectedValue(new Error('settlement unavailable')),
    };
    const publication = {
      publishSnapshot: vi.fn().mockRejectedValue(publicationError),
    };
    const service = makeService(repository, publication);

    await expect(service.completeAttempt(input(file))).rejects.toBe(publicationError);
    expect(repository.failAttempt).toHaveBeenCalledWith(expect.objectContaining({
      organizationId,
      userId,
      attemptId,
      attemptToken,
      errorCode: 'sellpia_publication_failed',
      contentChecksum: sha256(file),
    }));
  });
});

function makeService(
  repository: { readAttempt: ReturnType<typeof vi.fn>; failAttempt: ReturnType<typeof vi.fn> },
  publication: { publishSnapshot: ReturnType<typeof vi.fn> },
): SellpiaCollectionUseCase {
  return new SellpiaCollectionUseCase(
    repository as never,
    publication as never,
    {
      validate: vi.fn(),
      decode: vi.fn().mockReturnValue({ rows: [], headers: [], qualityFacts: [] }),
    } as never,
  );
}

function input(file: Buffer) {
  return {
    organizationId,
    userId,
    attemptId,
    attemptToken,
    file: { buffer: file, fileName: 'source.csv', mimeType: 'text/csv' },
  };
}

function attempt(state: SellpiaCollectionAttempt['state']): SellpiaCollectionAttempt {
  return {
    attemptId,
    attemptToken,
    generation: '1',
    state,
    plan: {
      sourceType: 'sellpia_inventory',
      parserVersion: 'sellpia-inventory-v1',
      scope: 'inventory',
      trigger: 'initial_snapshot',
      sourceOrigin: 'https://kiditem.sellpia.com',
      sourceAccountKey: 'kiditem',
      generation: '1',
    },
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    actualCutoffAt: null,
    fileName: null,
    fileHash: null,
    contentChecksum: null,
    rowCount: 0,
    errorCode: null,
    errorMessage: null,
  };
}

function sha256(file: Buffer): string {
  return createHash('sha256').update(file).digest('hex');
}
