import { describe, expect, it, vi } from 'vitest';
import { CoupangDirectOrderCollectionService } from './coupang-direct-order-collection.service';

describe('CoupangDirectOrderCollectionService', () => {
  it('validates one transport-independent capture and strips the projection transport', async () => {
    const transactions = { completeAttempt: vi.fn().mockResolvedValue({ state: 'COMPLETE' }) };
    const service = new CoupangDirectOrderCollectionService(transactions as never);

    await service.completeAttempt({
      organizationId: '22222222-2222-4222-8222-222222222222',
      userId: '33333333-3333-4333-8333-333333333333',
      attemptId: '44444444-4444-4444-8444-444444444444',
      attemptToken: '55555555-5555-4555-8555-555555555555',
      capture: request() as never,
    });

    expect(transactions.completeAttempt).toHaveBeenCalledWith(expect.objectContaining({
      capture: expect.objectContaining({
        channelAccountId: '44444444-4444-4444-8444-444444444444',
        pos: [
          expect.objectContaining({ seq: 'PO-1', transport: 'SHIPMENT' }),
          expect.objectContaining({ seq: 'PO-2', transport: 'MILKRUN' }),
        ],
      }),
    }));
    expect(transactions.completeAttempt.mock.calls[0]![0].capture).not.toHaveProperty('transport');
  });

  // Regression: 확장이 실제로 보내는 원본(센터 주소/우편/연락처 null, 납품예정일 빈값)을
  // strict 스키마가 통째로 400 으로 막지 않는다.
  it('accepts real extension payloads with empty center fields and blank edd', async () => {
    const transactions = { completeAttempt: vi.fn().mockResolvedValue({ state: 'COMPLETE' }) };
    const service = new CoupangDirectOrderCollectionService(transactions as never);
    const input = request();
    input.centers = { Center: { addr: null, zip: null, contact: null } } as never;
    input.pos[0]!.edd = '';

    await expect(service.completeAttempt({
      organizationId: '22222222-2222-4222-8222-222222222222',
      userId: '33333333-3333-4333-8333-333333333333',
      attemptId: '44444444-4444-4444-8444-444444444444',
      attemptToken: '55555555-5555-4555-8555-555555555555',
      capture: input as never,
    })).resolves.toMatchObject({ state: 'COMPLETE' });
  });

  it('validates a selected transport without terminalizing the source owner', async () => {
    const transactions = {
      consumeAttempt: vi.fn().mockResolvedValue({ transport: 'SHIPMENT' }),
    };
    const service = new CoupangDirectOrderCollectionService(transactions as never);

    await expect(service.consumeAttempt({
      organizationId: '22222222-2222-4222-8222-222222222222',
      userId: '33333333-3333-4333-8333-333333333333',
      attemptId: '44444444-4444-4444-8444-444444444444',
      attemptToken: '55555555-5555-4555-8555-555555555555',
      capture: request(),
      transport: 'SHIPMENT',
    })).resolves.toMatchObject({ transport: 'SHIPMENT' });
    expect(transactions.consumeAttempt).toHaveBeenCalledWith(expect.objectContaining({
      transport: 'SHIPMENT',
      capture: expect.not.objectContaining({ transport: expect.anything() }),
    }));
  });

  it('rejects identity-critical drift before persistence', async () => {
    const transactions = { completeAttempt: vi.fn() };
    const service = new CoupangDirectOrderCollectionService(transactions as never);
    const input = request();
    input.pos[0]!.items = [{
      skuId: '',
      barcode: '8801234567890',
      name: 'Rocket item',
      qty: 1,
      amount: 1000,
    }];

    await expect(service.completeAttempt({
      organizationId: '22222222-2222-4222-8222-222222222222',
      userId: '33333333-3333-4333-8333-333333333333',
      attemptId: '44444444-4444-4444-8444-444444444444',
      attemptToken: '55555555-5555-4555-8555-555555555555',
      capture: input as never,
    })).rejects.toThrow('Invalid Coupang direct order capture');
    expect(transactions.completeAttempt).not.toHaveBeenCalled();
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
