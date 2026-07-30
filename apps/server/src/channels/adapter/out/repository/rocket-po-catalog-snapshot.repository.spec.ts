import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../../prisma/prisma.service';
import { listSavedRocketPos } from './rocket-po-catalog-snapshot.repository';

describe('listSavedRocketPos', () => {
  it('matches both confirmation-request status names for the calendar filter', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      rocketPoCatalogSnapshot: { findMany },
    } as unknown as PrismaService;

    await listSavedRocketPos(prisma, {
      organizationId: '11111111-1111-4111-8111-111111111111',
      channelAccountId: '22222222-2222-4222-8222-222222222222',
      from: '2026-07-01',
      to: '2026-07-31',
      status: '거래처확인요청',
    });

    const query = findMany.mock.calls[0]?.[0];
    const confirmationRequestStatuses = {
      in: ['거래명세서확인요청', '거래처확인요청'],
    };
    expect(query.where.lines.some.poStatus).toEqual(confirmationRequestStatuses);
    expect(query.select.lines.where.poStatus).toEqual(confirmationRequestStatuses);
  });
});
