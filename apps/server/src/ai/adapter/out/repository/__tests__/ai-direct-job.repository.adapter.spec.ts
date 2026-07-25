import { describe, expect, it, vi } from 'vitest';
import { AiDirectJobRepositoryAdapter } from '../ai-direct-job.repository.adapter';

const NOW = new Date('2026-07-19T00:00:00.000Z');
const LEASE = new Date('2026-07-19T00:01:00.000Z');

const payload = {
  jobType: 'image_edit' as const,
  models: { image: 'gemini-image-model' },
  input: {
    image_url: 'https://storage.example.com/input.png',
    preset: 'custom',
  },
};

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    organizationId: '22222222-2222-4222-8222-222222222222',
    jobType: 'image_edit',
    sourceResourceId: '33333333-3333-4333-8333-333333333333',
    status: 'held',
    payload,
    result: null,
    attempts: 0,
    maxAttempts: 3,
    scheduledFor: NOW,
    claimedAt: null,
    claimedBy: null,
    leaseExpiresAt: null,
    finishedAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('AiDirectJobRepositoryAdapter', () => {
  it('finds a raster job by its organization-scoped source identity', async () => {
    const rasterPayload = {
      jobType: 'detail_page_rasterize' as const,
      models: {},
      input: {
        revisionId: '60620087-f5d8-4307-8591-221fd018eaa0',
        artifactId: '71429ba3-af81-409e-a976-029c67d86bcb',
        outputWidth: 780,
      },
    };
    const found = record({
      jobType: 'detail_page_rasterize',
      payload: rasterPayload,
      status: 'succeeded',
    });
    const findFirst = vi.fn().mockResolvedValue(found);
    const repository = new AiDirectJobRepositoryAdapter({
      aiDirectJob: { findFirst },
    } as never);

    await expect(repository.findBySource({
      organizationId: found.organizationId,
      jobType: 'detail_page_rasterize',
      sourceResourceId: found.sourceResourceId,
    })).resolves.toMatchObject({ status: 'succeeded' });

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: found.organizationId,
        jobType: 'detail_page_rasterize',
        sourceResourceId: found.sourceResourceId,
      },
    });
  });

  it('preserves a succeeded raster checkpoint instead of restarting it', async () => {
    const rasterPayload = {
      jobType: 'detail_page_rasterize' as const,
      models: {},
      input: {
        revisionId: '60620087-f5d8-4307-8591-221fd018eaa0',
        artifactId: '71429ba3-af81-409e-a976-029c67d86bcb',
        outputWidth: 780,
      },
    };
    const succeeded = record({
      jobType: 'detail_page_rasterize',
      payload: rasterPayload,
      status: 'succeeded',
      result: { imageUrl: 'https://cdn.example.com/detail.jpg' },
    });
    const findUnique = vi.fn().mockResolvedValue(succeeded);
    const updateMany = vi.fn();
    const create = vi.fn();
    const repository = new AiDirectJobRepositoryAdapter({
      aiDirectJob: { findUnique, updateMany, create },
    } as never);

    await expect(repository.restartHeldRasterization({
      organizationId: succeeded.organizationId,
      jobType: 'detail_page_rasterize',
      sourceResourceId: succeeded.sourceResourceId,
      payload: rasterPayload,
      status: 'held',
      scheduledFor: NOW,
    })).resolves.toMatchObject({ status: 'succeeded', result: succeeded.result });

    expect(updateMany).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('adopts the winning raster job when concurrent scheduling hits source uniqueness', async () => {
    const rasterPayload = {
      jobType: 'detail_page_rasterize' as const,
      models: {},
      input: {
        revisionId: '60620087-f5d8-4307-8591-221fd018eaa0',
        artifactId: '71429ba3-af81-409e-a976-029c67d86bcb',
        outputWidth: 780,
      },
    };
    const winner = record({
      jobType: 'detail_page_rasterize',
      payload: rasterPayload,
      status: 'held',
    });
    const findUnique = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(winner);
    const create = vi.fn().mockRejectedValue({ code: 'P2002' });
    const repository = new AiDirectJobRepositoryAdapter({
      aiDirectJob: { findUnique, create },
    } as never);

    await expect(repository.restartHeldRasterization({
      organizationId: winner.organizationId,
      jobType: 'detail_page_rasterize',
      sourceResourceId: winner.sourceResourceId,
      payload: rasterPayload,
      status: 'held',
      scheduledFor: NOW,
    })).resolves.toMatchObject({ id: winner.id, status: 'held' });
  });

  it('creates a held job through the provided write scope', async () => {
    const created = record();
    const prisma = {
      aiDirectJob: {
        create: vi.fn().mockResolvedValue(created),
      },
    };
    const repository = new AiDirectJobRepositoryAdapter(prisma as never);

    await expect(
      repository.create({
        id: created.id,
        organizationId: created.organizationId,
        jobType: 'image_edit',
        sourceResourceId: created.sourceResourceId,
        payload,
        status: 'held',
        scheduledFor: NOW,
      }),
    ).resolves.toMatchObject(created);

    expect(prisma.aiDirectJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: created.id,
        organizationId: created.organizationId,
        status: 'held',
        payload,
      }),
    });
  });

  it('restarts an existing thumbnail re-edit job instead of violating source uniqueness', async () => {
    const reeditPayload = {
      jobType: 'thumbnail_reedit' as const,
      models: { image: 'gemini-image-model' },
      input: {
        generationId: record().sourceResourceId,
        purpose: 'quality' as const,
        variantKey: 'auto' as const,
      },
    };
    const restarted = record({ jobType: 'thumbnail_reedit', payload: reeditPayload });
    const upsert = vi.fn().mockResolvedValue(restarted);
    const repository = new AiDirectJobRepositoryAdapter({ aiDirectJob: { upsert } } as never);

    await expect(
      repository.restartHeldReedit({
        organizationId: restarted.organizationId,
        jobType: 'thumbnail_reedit',
        sourceResourceId: restarted.sourceResourceId,
        payload: reeditPayload,
        status: 'held',
        scheduledFor: NOW,
      }),
    ).resolves.toMatchObject({ status: 'held', payload: reeditPayload });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_jobType_sourceResourceId: {
            organizationId: restarted.organizationId,
            jobType: 'thumbnail_reedit',
            sourceResourceId: restarted.sourceResourceId,
          },
        },
        update: expect.objectContaining({
          status: 'held',
          attempts: 0,
          claimedAt: null,
          finishedAt: null,
        }),
      }),
    );
  });

  it('claims a raw SQL row and exposes its previous status', async () => {
    const claimed = record({
      status: 'running',
      attempts: 1,
      claimedAt: NOW,
      claimedBy: 'worker-1',
      leaseExpiresAt: LEASE,
    });
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([
        {
          id: claimed.id,
          organization_id: claimed.organizationId,
          job_type: claimed.jobType,
          source_resource_id: claimed.sourceResourceId,
          status: claimed.status,
          payload: claimed.payload,
          result: claimed.result,
          attempts: claimed.attempts,
          max_attempts: claimed.maxAttempts,
          scheduled_for: claimed.scheduledFor,
          claimed_at: claimed.claimedAt,
          claimed_by: claimed.claimedBy,
          lease_expires_at: claimed.leaseExpiresAt,
          finished_at: claimed.finishedAt,
          last_error_code: claimed.lastErrorCode,
          last_error_message: claimed.lastErrorMessage,
          created_at: claimed.createdAt,
          updated_at: claimed.updatedAt,
          previous_status: 'pending',
        },
      ]),
    };
    const repository = new AiDirectJobRepositoryAdapter(prisma as never);

    await expect(
      repository.claimNext({
        workerId: 'worker-1',
        now: NOW,
        leaseExpiresAt: LEASE,
      }),
    ).resolves.toMatchObject({
      id: claimed.id,
      status: 'running',
      claimedFromStatus: 'pending',
      payload,
    });
  });

  it('checkpoints only a running job and moves it to projecting', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const repository = new AiDirectJobRepositoryAdapter({
      aiDirectJob: { updateMany },
    } as never);

    await expect(
      repository.checkpointResult({
        organizationId: record().organizationId,
        jobId: record().id,
        result: { image_url: 'https://storage.example.com/output.png' },
      }),
    ).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: record().id,
        organizationId: record().organizationId,
        status: 'running',
      },
      data: {
        result: { image_url: 'https://storage.example.com/output.png' },
        status: 'projecting',
      },
    });
  });
});
