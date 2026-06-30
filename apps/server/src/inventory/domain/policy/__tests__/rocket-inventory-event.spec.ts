import { describe, expect, it } from 'vitest';
import { buildRocketInventoryEvent } from '../rocket-inventory-event';

describe('buildRocketInventoryEvent', () => {
  it('reserves stock without changing current stock', () => {
    expect(buildRocketInventoryEvent({
      eventType: 'reserve',
      quantity: 4,
      openReservationQty: 0,
    })).toMatchObject({ reservedDelta: 4, stockDelta: 0 });
  });

  it('issues stock by reducing reservation and current stock', () => {
    expect(buildRocketInventoryEvent({
      eventType: 'issue',
      quantity: 3,
      openReservationQty: 5,
    })).toMatchObject({ reservedDelta: -3, stockDelta: -3, overReservationQty: 0 });
  });

  it('blocks issue over open reservation without override reason', () => {
    expect(() => buildRocketInventoryEvent({
      eventType: 'issue',
      quantity: 5,
      openReservationQty: 3,
    })).toThrow('open reservation');
  });

  it('allows issue over open reservation with override reason', () => {
    expect(buildRocketInventoryEvent({
      eventType: 'issue',
      quantity: 5,
      openReservationQty: 3,
      allowOverReservation: true,
      overrideReason: 'manual shipment count correction',
    })).toMatchObject({ reservedDelta: -3, stockDelta: -5, overReservationQty: 2 });
  });

  it('returns stock without changing reservation', () => {
    expect(buildRocketInventoryEvent({
      eventType: 'return_restock',
      quantity: 2,
      openReservationQty: 0,
    })).toMatchObject({ reservedDelta: 0, stockDelta: 2 });
  });
});
