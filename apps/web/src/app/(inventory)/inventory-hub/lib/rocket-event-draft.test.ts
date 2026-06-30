import { describe, expect, it } from 'vitest';
import {
  buildRocketEventDraftHref,
  parseRocketEventDraft,
  validateRocketEventDraft,
} from './rocket-event-draft';

describe('rocket event draft', () => {
  it('builds Inventory Hub links that open the Rocket event tab', () => {
    expect(buildRocketEventDraftHref({
      eventType: 'issue',
      sourceRef: 'shipment-2026-06-29',
      quantity: 3,
    })).toBe('/inventory-hub?tab=rocket-events&eventType=issue&quantity=3&sourceRef=shipment-2026-06-29');
  });

  it('parses query params into form-safe values', () => {
    const draft = parseRocketEventDraft(new URLSearchParams('eventType=return_restock&sourceRef=R-1&quantity=2'));

    expect(draft).toEqual({
      eventType: 'return_restock',
      sourceRef: 'R-1',
      quantity: '2',
    });
  });

  it('validates required fields and over-reservation reason', () => {
    expect(validateRocketEventDraft({
      inventoryId: '',
      optionId: '',
      eventType: 'issue',
      quantity: '0',
      sourceRef: '',
      openReservationQty: '',
      allowOverReservation: false,
      overrideReason: '',
      note: '',
    })).toEqual('Inventory ID, Option ID, Source reference, 수량을 입력하세요.');

    expect(validateRocketEventDraft({
      inventoryId: '00000000-0000-4000-8000-000000000001',
      optionId: '00000000-0000-4000-8000-000000000002',
      eventType: 'issue',
      quantity: '5',
      sourceRef: 'shipment-1',
      openReservationQty: '3',
      allowOverReservation: true,
      overrideReason: '',
      note: '',
    })).toBe('초과 출고 사유를 입력하세요.');
  });
});
