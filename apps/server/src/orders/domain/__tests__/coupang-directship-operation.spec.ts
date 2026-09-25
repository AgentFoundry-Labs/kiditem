import { describe, expect, it } from 'vitest';
import type { OperationStagedChunk } from '@kiditem/shared/operation';
import { assembleDirectshipCapture, parseCapture } from '../coupang-directship-operation';

const ACCOUNT = '44444444-4444-4444-8444-444444444444';
const item = { skuId: 'P-1', barcode: '8801234567890', name: 'Rocket item', qty: 2, amount: 2000 };
const po = (seq: string, transport: 'SHIPMENT' | 'MILKRUN', overrides: Record<string, unknown> = {}) => ({
  seq, status: 'PA', center: 'Center', transport, edd: '2026-07-20', reg: '2026-07-18 09:00:00', items: [item], ...overrides,
});
const chunk = (payload: unknown[], chunkKind = 'orders_capture') => ({ chunkKind, sequence: 1, payload, checksum: 'x', itemCount: payload.length }) as OperationStagedChunk;
const refusal = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error as { code: string; details: { reason: string } };
  }
  throw new Error('expected a refusal');
};

describe('directship 캡처 조립·검증(KID-359)', () => {
  it('발주서 항목과 센터표 하나를 운송유형 무관 캡처로 모은다(순서 그대로)', () => {
    const capture = parseCapture(assembleDirectshipCapture([
      chunk([{ purchaseOrder: po('PO-1', 'SHIPMENT') }, { centers: { Center: { addr: 'Seoul' } } }]),
      chunk([{ purchaseOrder: po('PO-2', 'MILKRUN') }]),
    ], ACCOUNT));
    expect(capture).toEqual({
      channelAccountId: ACCOUNT,
      centers: { Center: { addr: 'Seoul' } },
      pos: [expect.objectContaining({ seq: 'PO-1', transport: 'SHIPMENT' }), expect.objectContaining({ seq: 'PO-2', transport: 'MILKRUN' })],
    });
    expect(capture).not.toHaveProperty('transport');
  });

  // 확장이 실제로 보내는 원본(센터 주소·우편·연락처 null, 납품예정일 빈값)을 막지 않는다(옛 회귀).
  it('센터 칸이 비었거나 납품예정일이 빈 원본을 받는다', () => {
    const capture = parseCapture(assembleDirectshipCapture([
      chunk([{ purchaseOrder: po('PO-1', 'SHIPMENT', { edd: '' }) }, { centers: { Center: { addr: null, zip: null, contact: null } } }]),
    ], ACCOUNT));
    expect(capture.centers).toEqual({ Center: {} });
    expect(capture.pos[0]!.edd).toBe('');
  });

  it('식별이 빈 품목·같은 (발주, SKU) 줄 두 번은 보관 전에 거절한다', () => {
    expect(refusal(() => assembleDirectshipCapture([chunk([{ purchaseOrder: po('PO-1', 'SHIPMENT', { items: [{ ...item, skuId: '' }] }) }, { centers: {} }])], ACCOUNT)))
      .toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'invalid_chunk_item' } });
    expect(refusal(() => parseCapture(assembleDirectshipCapture([chunk([{ purchaseOrder: po('PO-1', 'SHIPMENT', { items: [item, item] }) }, { centers: {} }])], ACCOUNT))))
      .toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'coupang_direct_capture_invalid' } });
  });

  it('센터표가 없거나 두 개면, 다른 청크 종류면 거절한다', () => {
    expect(refusal(() => assembleDirectshipCapture([chunk([{ purchaseOrder: po('PO-1', 'SHIPMENT') }])], ACCOUNT)))
      .toMatchObject({ details: { reason: 'coupang_direct_centers_missing' } });
    expect(refusal(() => assembleDirectshipCapture([chunk([{ centers: {} }, { centers: {} }])], ACCOUNT)))
      .toMatchObject({ details: { reason: 'coupang_direct_centers_missing' } });
    expect(refusal(() => assembleDirectshipCapture([chunk([], 'po_rows')], ACCOUNT))).toMatchObject({ details: { reason: 'unknown_chunk_kind' } });
  });
});
