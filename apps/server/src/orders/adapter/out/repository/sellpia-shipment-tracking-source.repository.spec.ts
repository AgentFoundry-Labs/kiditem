import { describe, expect, it, vi } from 'vitest';
import { SellpiaShipmentTrackingSourceRepository } from './sellpia-shipment-tracking-source.repository';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const ATTEMPT_ID = '22222222-2222-4222-8222-222222222222';
const TOKEN = '33333333-3333-4333-8333-333333333333';

describe('SellpiaShipmentTrackingSourceRepository', () => {
  it('fences terminal completion and replays identical bytes without a second artifact', async () => {
    const rows = new Map([[ATTEMPT_ID, sourceRun()]]);
    const { repository, artifacts } = fakeRepository(rows);
    const source = {
      bytes: Buffer.from('{"rows":[],"total":0,"range":{"start":"2026-09-07","end":"2026-09-07"}}'),
      fileName: 'sellpia-shipment-tracking-v1.json',
      contentType: 'application/json',
    };

    const first = await repository.completeAttempt({
      organizationId: ORGANIZATION_ID,
      attemptId: ATTEMPT_ID,
      attemptToken: TOKEN,
      source,
    });
    const replay = await repository.completeAttempt({
      organizationId: ORGANIZATION_ID,
      attemptId: ATTEMPT_ID,
      attemptToken: TOKEN,
      source,
    });

    expect(first.state).toBe('COMPLETE');
    expect(replay.state).toBe('COMPLETE');
    expect(artifacts).toHaveLength(1);
  });

  it('rejects a stale source token before writing an artifact', async () => {
    const rows = new Map([[ATTEMPT_ID, sourceRun()]]);
    const { repository, artifacts } = fakeRepository(rows);

    await expect(repository.completeAttempt({
      organizationId: ORGANIZATION_ID,
      attemptId: ATTEMPT_ID,
      attemptToken: '44444444-4444-4444-8444-444444444444',
      source: {
        bytes: Buffer.from('{}'),
        fileName: 'capture.json',
        contentType: 'application/json',
      },
    })).rejects.toThrow('ATTEMPT_FENCE_LOST');
    expect(artifacts).toHaveLength(0);
  });

  it('keeps the organization predicate on a terminal failure update', async () => {
    const rows = new Map([[ATTEMPT_ID, sourceRun()]]);
    const { repository, sourceRunUpdate } = fakeRepository(rows);

    await repository.failAttempt({
      organizationId: ORGANIZATION_ID,
      attemptId: ATTEMPT_ID,
      attemptToken: TOKEN,
      errorCode: 'sellpia_network_failed',
      errorMessage: 'provider unavailable',
    });

    expect(sourceRunUpdate.mock.calls[0]?.[0]?.where).toEqual({
      id: ATTEMPT_ID,
      organizationId: ORGANIZATION_ID,
    });
  });
});

function sourceRun() {
  return {
    id: ATTEMPT_ID,
    organizationId: ORGANIZATION_ID,
    sourceType: 'sellpia_shipment_tracking',
    channelAccountId: null,
    attemptToken: TOKEN,
    status: 'running',
    plan: {
      sourceType: 'sellpia_shipment_tracking',
      parserVersion: 'sellpia-shipment-tracking-v1',
      sourceOrigin: 'https://kiditem.sellpia.com',
      sourceAccountKey: 'kiditem',
      startDate: '2026-09-07',
      endDate: '2026-09-07',
    },
    expiresAt: new Date(Date.now() + 60_000),
    contentChecksum: null,
    contentByteCount: null,
    fileName: null,
    errorCode: null,
    errorMessage: null,
  };
}

function fakeRepository(rows: Map<string, ReturnType<typeof sourceRun>>) {
  const artifacts: Record<string, unknown>[] = [];
  const tx = {
    $queryRaw: vi.fn(),
    sourceImportRun: {
      findFirst: vi.fn(({ where }: { where: { id?: string } }) => Promise.resolve(
        where.id ? rows.get(where.id) ?? null : null,
      )),
      update: vi.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = rows.get(where.id);
        const updated = { ...row, ...data };
        rows.set(where.id, updated as ReturnType<typeof sourceRun>);
        return Promise.resolve(updated);
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
      findFirst: vi.fn(({ where }: { where: { sourceImportRunId: string } }) => {
        const data = artifacts.find((item) => item.sourceImportRunId === where.sourceImportRunId);
        return Promise.resolve(data
          ? {
              ...data,
              id: `artifact-${String(data.sourceImportRunId)}`,
              createdAt: new Date(),
            }
          : null);
      }),
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
    repository: new SellpiaShipmentTrackingSourceRepository(prisma as never, alerts as never),
    artifacts,
    sourceRunUpdate: tx.sourceImportRun.update,
  };
}
