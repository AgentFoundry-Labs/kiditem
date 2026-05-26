import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SourcingWorkspaceSnapshotService } from '../sourcing-workspace-snapshot.service';
import type {
  SourcingWorkspaceSnapshotRepositoryPort,
  SourcingWorkspaceSnapshotRow,
} from '../../port/out/repository/sourcing-workspace-snapshot.repository.port';

describe('SourcingWorkspaceSnapshotService', () => {
  let repository: SourcingWorkspaceSnapshotRepositoryPort;
  let service: SourcingWorkspaceSnapshotService;

  beforeEach(() => {
    repository = {
      find: vi.fn(async () => null),
      upsert: vi.fn(async (input) => ({
        id: 'snapshot-1',
        organizationId: input.organizationId,
        scope: input.scope,
        businessDate: input.businessDate,
        payload: input.payload,
        createdAt: new Date('2026-05-27T00:00:00.000Z'),
        updatedAt: new Date('2026-05-27T00:00:00.000Z'),
      } satisfies SourcingWorkspaceSnapshotRow)),
    };
    service = new SourcingWorkspaceSnapshotService(repository);
  });

  it('accepts versioned today recommendation result snapshots', async () => {
    const payload = {
      version: 1,
      input: {
        keywordText: '유아 퍼즐',
        keywordLimit: 10,
        maxPages: 1,
      },
      result: {
        rows: [],
        productSnapshots: [],
      },
      meta: {
        generatedAt: '2026-05-27T01:00:00.000Z',
        generationSource: 'manual',
        generatorVersion: 'sourcing-workspace-snapshot.v1',
      },
    };

    await service.saveToday('00000000-0000-4000-8000-000000000001', 'today_recommendations', payload);

    expect(repository.upsert).toHaveBeenCalledWith(expect.objectContaining({ payload }));
  });

  it('rejects the old flat today recommendation payload shape', async () => {
    await expect(service.saveToday(
      '00000000-0000-4000-8000-000000000001',
      'today_recommendations',
      {
        version: 1,
        rows: [],
        productSnapshots: [],
        savedIds: [],
        keywordText: '유아 퍼즐',
        keywordLimit: 10,
        maxPages: 1,
        updatedAt: '2026-05-27T01:00:00.000Z',
      },
    )).rejects.toBeInstanceOf(BadRequestException);
  });
});
