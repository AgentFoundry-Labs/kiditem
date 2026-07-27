import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../../prisma/prisma.service';
import { CoupangShipmentDateSummaryRepositoryAdapter } from './coupang-shipment-date-summary.repository.adapter';

describe('CoupangShipmentDateSummaryRepositoryAdapter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('deduplicates with last-write-wins and executes one bound bulk statement', async () => {
    vi.useFakeTimers();
    const capturedAt = new Date('2026-07-27T12:00:00.000Z');
    vi.setSystemTime(capturedAt);
    const prisma = {
      $executeRaw: vi.fn().mockResolvedValue(2),
      $transaction: vi.fn(),
      coupangShipmentDateSummary: {
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn(),
      },
    };
    const repository = new CoupangShipmentDateSummaryRepositoryAdapter(
      prisma as unknown as PrismaService,
    );

    await repository.upsertDateSummary('11111111-1111-4111-8111-111111111111', [
      { date: '2026-07-28', count: 1, boxes: 2 },
      { date: '2026-07-29', count: 3, boxes: 4 },
      { date: '2026-07-28', count: 9, boxes: 10 },
    ]);

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.coupangShipmentDateSummary.upsert).not.toHaveBeenCalled();
    const statement = prisma.$executeRaw.mock.calls[0]![0] as { values: unknown[] };
    expect(statement.values).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '2026-07-28',
      9,
      10,
      capturedAt,
      capturedAt,
      '11111111-1111-4111-8111-111111111111',
      '2026-07-29',
      3,
      4,
      capturedAt,
      capturedAt,
    ]);
    expect(prisma.coupangShipmentDateSummary.findMany).toHaveBeenCalledTimes(1);
  });

  it('skips SQL for an empty input and still returns the current organization view', async () => {
    const prisma = {
      $executeRaw: vi.fn(),
      coupangShipmentDateSummary: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const repository = new CoupangShipmentDateSummaryRepositoryAdapter(
      prisma as unknown as PrismaService,
    );

    await expect(repository.upsertDateSummary(
      '11111111-1111-4111-8111-111111111111',
      [],
    )).resolves.toEqual([]);

    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(prisma.coupangShipmentDateSummary.findMany).toHaveBeenCalledTimes(1);
  });
});
