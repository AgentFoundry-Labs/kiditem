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

  // Regression: 확장이 실제로 보내는 원본(센터 주소/우편/연락처 null, 납품예정일 빈값)을
  // strict 스키마가 통째로 "Invalid Coupang direct order collection" 400 으로 막던 버그.
  it('accepts real extension payloads with empty center fields and blank edd', async () => {
    const transactions = {
      collect: vi.fn().mockResolvedValue({
        importRunId: '11111111-1111-4111-8111-111111111111',
        reconciledRows: 1,
        duplicate: false,
      }),
    };
    const service = new CoupangDirectOrderCollectionService(transactions as never);
    const input = request();
    input.centers = { Center: { addr: null, zip: null, contact: null } } as never;
    input.pos[0]!.edd = '';

    const result = await service.collect({
      organizationId: '22222222-2222-4222-8222-222222222222',
      userId: '33333333-3333-4333-8333-333333333333',
      request: input as never,
    });

    expect(result).toEqual({
      importRunId: '11111111-1111-4111-8111-111111111111',
      reconciledRows: 1,
      duplicate: false,
    });
    expect(transactions.collect).toHaveBeenCalledTimes(1);
    const forwarded = transactions.collect.mock.calls[0]![0].request;
    expect(forwarded.pos).toHaveLength(1);
    expect(forwarded.pos[0].seq).toBe('PO-1');
  });

  // Regression: 발주 상세(품목) 수집 실패로 items 가 비면 예전에는 400 "Invalid" 였다.
  // 이제는 원인을 알리는 한국어 메시지로 바꾸되 조용히 성공 처리하지 않는다.
  it('reports a truthful error when item details could not be collected', async () => {
    const transactions = { collect: vi.fn() };
    const service = new CoupangDirectOrderCollectionService(transactions as never);
    const input = request();
    input.pos[0]!.items = [];

    const promise = service.collect({
      organizationId: '22222222-2222-4222-8222-222222222222',
      userId: '33333333-3333-4333-8333-333333333333',
      request: input as never,
    });
    await expect(promise).rejects.toBeInstanceOf(BadRequestException);
    await expect(promise).rejects.toThrow('쿠팡 발주 상세(품목)를 수집하지 못했습니다');
    await expect(promise).rejects.not.toThrow('Invalid Coupang direct order collection');
    expect(transactions.collect).not.toHaveBeenCalled();
  });

  // 식별자·수량 같은 무결성 필드는 여전히 strict — 조용히 흡수하지 않는다.
  it('still rejects identity-critical drift with a 400', async () => {
    const transactions = { collect: vi.fn() };
    const service = new CoupangDirectOrderCollectionService(transactions as never);
    const input = request();
    input.pos[0]!.items = [{
      skuId: '',
      barcode: '8801234567890',
      name: 'Rocket item',
      qty: 1,
      amount: 1000,
    }];

    await expect(service.collect({
      organizationId: '22222222-2222-4222-8222-222222222222',
      userId: '33333333-3333-4333-8333-333333333333',
      request: input as never,
    })).rejects.toThrow('Invalid Coupang direct order collection');
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
