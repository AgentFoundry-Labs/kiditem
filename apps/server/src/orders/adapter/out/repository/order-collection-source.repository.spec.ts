import { describe, expect, it, vi } from 'vitest';
import { OrderCollectionSourceRepository } from './order-collection-source.repository';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

describe('OrderCollectionSourceRepository', () => {
  it('allows the same source bytes in distinct attempts without file-hash dedupe', async () => {
    const rows = new Map([
      [
        '22222222-2222-4222-8222-222222222222',
        sourceRun('22222222-2222-4222-8222-222222222222', 'token-1'),
      ],
      [
        '33333333-3333-4333-8333-333333333333',
        sourceRun('33333333-3333-4333-8333-333333333333', 'token-2'),
      ],
    ]);
    const { repository, artifacts, updates } = fakeRepository(rows);
    const source = {
      bytes: Buffer.from('same-upload'),
      fileName: 'orders.csv',
      contentType: 'text/csv',
      isFile: true,
    } as const;

    await repository.completeAttempt({
      organizationId: ORGANIZATION_ID,
      attemptId: '22222222-2222-4222-8222-222222222222',
      attemptToken: 'token-1',
      mallKey: 'kidsnote',
      source,
      confirmedCoverage: null,
    });
    await repository.completeAttempt({
      organizationId: ORGANIZATION_ID,
      attemptId: '33333333-3333-4333-8333-333333333333',
      attemptToken: 'token-2',
      mallKey: 'kidsnote',
      source,
      confirmedCoverage: null,
    });

    expect(artifacts).toHaveLength(2);
    expect(updates).toHaveLength(2);
    expect(updates.map((update) => update.data.fileHash)).toEqual([undefined, undefined]);
    expect(updates[0]?.data.contentChecksum).toBe(updates[1]?.data.contentChecksum);
  });

  it('rejects an expired terminal call without attempting a rolled-back failure write', async () => {
    const rows = new Map([
      [
        '44444444-4444-4444-8444-444444444444',
        sourceRun(
          '44444444-4444-4444-8444-444444444444',
          'expired-token',
          new Date(Date.now() - 1_000),
        ),
      ],
    ]);
    const { repository, artifacts, updates } = fakeRepository(rows);

    await expect(repository.completeAttempt({
      organizationId: ORGANIZATION_ID,
      attemptId: '44444444-4444-4444-8444-444444444444',
      attemptToken: 'expired-token',
      mallKey: 'kidsnote',
      source: {
        bytes: Buffer.from('{}'),
        fileName: 'orders.json',
        contentType: 'application/json',
        isFile: false,
      },
      confirmedCoverage: null,
    })).rejects.toThrow('ATTEMPT_EXPIRED');

    expect(artifacts).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });
});

function sourceRun(id: string, attemptToken: string, expiresAt = new Date(Date.now() + 60_000)) {
  return {
    id,
    organizationId: ORGANIZATION_ID,
    sourceType: 'order_collection_mall',
    channelAccountId: '55555555-5555-4555-8555-555555555555',
    attemptToken,
    status: 'running',
    plan: {
      sourceType: 'order_collection_mall',
      parserVersion: 'order-collection-v1',
      mallKey: 'kidsnote',
      mallName: '키즈노트',
      channelAccountId: '55555555-5555-4555-8555-555555555555',
      collectionDate: null,
      collectionMode: 'manual-upload',
    },
    expiresAt,
    contentChecksum: null,
    coverageStartDate: null,
    coverageEndDate: null,
    errorCode: null,
    errorMessage: null,
  };
}

function fakeRepository(rows: Map<string, ReturnType<typeof sourceRun>>) {
  const artifacts: Record<string, unknown>[] = [];
  const updates: Record<string, any>[] = [];
  const tx = {
    $queryRaw: vi.fn(),
    sourceImportRun: {
      findFirst: vi.fn(({ where }: { where: { id?: string } }) => Promise.resolve(
        where.id ? rows.get(where.id) ?? null : null,
      )),
      update: vi.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        updates.push({ where, data });
        const row = rows.get(where.id);
        return Promise.resolve({ ...row, ...data });
      }),
    },
    orderCollectionArtifact: {
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        artifacts.push(data);
        return Promise.resolve({
          ...data,
          id: `artifact-${String(data.sourceImportRunId)}`,
          createdAt: new Date(),
        });
      }),
      findFirst: vi.fn(),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
  };
  const alerts = {
    resolveSourceFailure: vi.fn(),
    recordTerminalOutcome: vi.fn(),
  };
  return {
    repository: new OrderCollectionSourceRepository(prisma as never, alerts as never),
    artifacts,
    updates,
  };
}
