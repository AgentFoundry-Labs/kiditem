import { describe, expect, it, vi } from 'vitest';
import type { AiDirectJobRecord } from '../port/out/repository/ai-direct-job.repository.port';
import { DetailPageRasterJobService } from './detail-page-raster-job.service';

const ORG = '3bc63d9d-74a1-4806-bbba-1e49710b5467';
const REVISION = '60620087-f5d8-4307-8591-221fd018eaa0';
const ARTIFACT = '71429ba3-af81-409e-a976-029c67d86bcb';

function rasterJob(overrides: Partial<AiDirectJobRecord> = {}): AiDirectJobRecord {
  const now = new Date('2026-07-25T08:00:00.000Z');
  return {
    id: '11111111-1111-4111-8111-111111111111',
    organizationId: ORG,
    jobType: 'detail_page_rasterize',
    sourceResourceId: '22222222-2222-5222-8222-222222222222',
    status: 'held',
    payload: {
      jobType: 'detail_page_rasterize',
      models: {},
      input: { revisionId: REVISION, artifactId: ARTIFACT, outputWidth: 780 },
    },
    result: null,
    attempts: 0,
    maxAttempts: 3,
    scheduledFor: now,
    claimedAt: null,
    claimedBy: null,
    leaseExpiresAt: null,
    finishedAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeService(existing: AiDirectJobRecord | null) {
  const repository = {
    findBySource: vi.fn().mockResolvedValue(existing),
    restartHeldRasterization: vi.fn().mockResolvedValue(existing ?? rasterJob()),
    release: vi.fn().mockResolvedValue(true),
  };
  const worker = { wake: vi.fn() };
  return {
    service: new DetailPageRasterJobService(
      repository as never,
      worker as never,
      { heldRecoveryMs: 30_000 } as never,
    ),
    repository,
    worker,
  };
}

describe('DetailPageRasterJobService', () => {
  it('creates and releases one durable job when a rendition is absent', async () => {
    const { service, repository, worker } = makeService(null);

    await expect(service.ensureScheduled({
      organizationId: ORG,
      revisionId: REVISION,
      artifactId: ARTIFACT,
      outputWidth: 780,
    })).resolves.toMatchObject({ status: 'processing' });

    expect(repository.restartHeldRasterization).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        jobType: 'detail_page_rasterize',
        payload: {
          jobType: 'detail_page_rasterize',
          models: {},
          input: { revisionId: REVISION, artifactId: ARTIFACT, outputWidth: 780 },
        },
        status: 'held',
      }),
    );
    expect(repository.release).toHaveBeenCalledWith({
      organizationId: ORG,
      jobId: rasterJob().id,
    });
    expect(worker.wake).toHaveBeenCalledOnce();
  });

  it('returns a validated succeeded checkpoint without restarting it', async () => {
    const completed = rasterJob({
      status: 'succeeded',
      result: {
        revisionId: REVISION,
        artifactId: ARTIFACT,
        imageUrl: 'https://cdn.example.com/detail.jpg',
        outputWidth: 780,
        contentType: 'image/jpeg',
        byteLength: 2048,
      },
    });
    const { service, repository, worker } = makeService(completed);

    await expect(service.statusForRevision({
      organizationId: ORG,
      revisionId: REVISION,
      outputWidth: 780,
    })).resolves.toMatchObject({
      status: 'rendered',
      output: { imageUrl: 'https://cdn.example.com/detail.jpg' },
    });
    expect(repository.restartHeldRasterization).not.toHaveBeenCalled();
    expect(worker.wake).not.toHaveBeenCalled();
  });
});
