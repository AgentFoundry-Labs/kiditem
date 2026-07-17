import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CoupangDirectOrderCollectionService } from './coupang-direct-order-collection.service';

describe('CoupangDirectOrderCollectionService', () => {
  it('parses and keeps only the selected transport before persistence', async () => {
    const transactions = {
      collect: vi.fn().mockResolvedValue({
        importRunId: '11111111-1111-4111-8111-111111111111',
        reconciledRows: 1,
        duplicate: false,
      }),
    };
    const service = new CoupangDirectOrderCollectionService(transactions);

    await service.collect({
      organizationId: '22222222-2222-4222-8222-222222222222',
      userId: '33333333-3333-4333-8333-333333333333',
      request: request() as never,
    });

    expect(transactions.collect).toHaveBeenCalledWith({
      organizationId: '22222222-2222-4222-8222-222222222222',
      userId: '33333333-3333-4333-8333-333333333333',
      request: expect.objectContaining({
        transport: 'SHIPMENT',
        pos: [expect.objectContaining({ seq: 'PO-1', transport: 'SHIPMENT' })],
      }),
    });
  });

  it('rejects a collection with no confirmed PO for the selected transport', async () => {
    const transactions = { collect: vi.fn() };
    const service = new CoupangDirectOrderCollectionService(transactions as never);
    const input = request();
    input.pos = input.pos.filter(({ transport }) => transport === 'MILKRUN');

    await expect(service.collect({
      organizationId: '22222222-2222-4222-8222-222222222222',
      userId: '33333333-3333-4333-8333-333333333333',
      request: input as never,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(transactions.collect).not.toHaveBeenCalled();
  });
});

function request() {
  const item = {
    skuId: 'P-1',
    barcode: '8801234567890',
    name: 'Rocket item',
    qty: 2,
    amount: 2000,
  };
  return {
    channelAccountId: '44444444-4444-4444-8444-444444444444',
    transport: 'SHIPMENT' as const,
    centers: { Center: { addr: 'Seoul' } },
    pos: [{
      seq: 'PO-1',
      status: 'PA' as const,
      center: 'Center',
      transport: 'SHIPMENT' as 'SHIPMENT' | 'MILKRUN',
      edd: '2026-07-20',
      reg: '2026-07-18 09:00:00',
      items: [item],
    }, {
      seq: 'PO-2',
      status: 'PA' as const,
      center: 'Center',
      transport: 'MILKRUN' as 'SHIPMENT' | 'MILKRUN',
      edd: '2026-07-20',
      reg: '2026-07-18 09:00:00',
      items: [item],
    }],
  };
}
