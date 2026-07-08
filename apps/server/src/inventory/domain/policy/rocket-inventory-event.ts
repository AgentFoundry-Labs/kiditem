import type { RocketInventoryEventType } from '@kiditem/shared/inventory';

export class RocketInventoryPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RocketInventoryPolicyError';
  }
}

export type RocketInventoryPolicyInput = {
  eventType: RocketInventoryEventType;
  quantity: number;
  openReservationQty: number;
  allowOverReservation?: boolean;
  overrideReason?: string;
};

export type RocketInventoryPolicyResult = {
  reservedDelta: number;
  stockDelta: number;
  overReservationQty: number;
};

export function buildRocketInventoryEvent(
  input: RocketInventoryPolicyInput,
): RocketInventoryPolicyResult {
  if (input.quantity <= 0) throw new RocketInventoryPolicyError('quantity must be positive');
  if (input.eventType === 'reserve') {
    return { reservedDelta: input.quantity, stockDelta: 0, overReservationQty: 0 };
  }
  if (input.eventType === 'release') {
    if (input.quantity > input.openReservationQty) {
      throw new RocketInventoryPolicyError('cannot release more than the open reservation');
    }
    return { reservedDelta: -input.quantity, stockDelta: 0, overReservationQty: 0 };
  }
  if (input.eventType === 'issue') {
    const reservedToConsume = Math.min(input.quantity, input.openReservationQty);
    const overReservationQty = Math.max(input.quantity - input.openReservationQty, 0);
    if (overReservationQty > 0 && (!input.allowOverReservation || !input.overrideReason?.trim())) {
      throw new RocketInventoryPolicyError(
        'cannot issue more than the open reservation without override reason',
      );
    }
    return { reservedDelta: -reservedToConsume, stockDelta: -input.quantity, overReservationQty };
  }
  return { reservedDelta: 0, stockDelta: input.quantity, overReservationQty: 0 };
}
