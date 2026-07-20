import { describe, expect, it } from 'vitest';
import {
  canonicalCoupangDirectOrderHash,
  mapCoupangDirectOrder,
} from './coupang-direct-order.mapper';

describe('Coupang direct order mapper', () => {
  it('maps PA evidence to the channel-agnostic order spine with a stable line ID', () => {
    const request = input();
    const first = mapCoupangDirectOrder(
      request.pos[0]!,
      request.centers[request.pos[0]!.center],
    );
    const replay = mapCoupangDirectOrder(
      request.pos[0]!,
      request.centers[request.pos[0]!.center],
    );

    expect(first).toMatchObject({
      externalOrderId: 'PO-1',
      receiverName: 'Seoul FC',
      receiverAddr: 'Seoul address',
      receiverPhone: '02-1234-5678',
      status: 'confirmed',
      totalPrice: 3000,
      lines: [{
        externalLineId: expect.stringMatching(/^coupang-direct:/),
        productName: 'Rocket item',
        sku: 'P-1',
        externalBarcode: '8801234567890',
        quantity: 3,
        unitPrice: 1000,
        totalPrice: 3000,
      }],
    });
    expect(first.lines[0]!.externalLineId).toBe(replay.lines[0]!.externalLineId);
  });

  it('hashes equivalent PO and center ordering identically', () => {
    const request = input();
    const reordered = {
      ...request,
      centers: Object.fromEntries(Object.entries(request.centers).reverse()),
      pos: [...request.pos].reverse(),
    };

    expect(canonicalCoupangDirectOrderHash(request))
      .toBe(canonicalCoupangDirectOrderHash(reordered));
  });
});

function input() {
  return {
    channelAccountId: '11111111-1111-4111-8111-111111111111',
    transport: 'SHIPMENT' as const,
    centers: {
      'Seoul FC': {
        addr: 'Seoul address',
        zip: '01234',
        contact: '02-1234-5678',
      },
    },
    pos: [{
      seq: 'PO-1',
      status: 'PA' as const,
      center: 'Seoul FC',
      transport: 'SHIPMENT' as const,
      edd: '2026-07-20',
      reg: '2026-07-18 09:00:00',
      items: [{
        skuId: 'P-1',
        barcode: '8801234567890',
        name: 'Rocket item',
        qty: 3,
        amount: 3000,
      }],
    }],
  };
}
