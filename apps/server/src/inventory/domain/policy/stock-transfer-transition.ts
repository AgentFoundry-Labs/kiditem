const VALID_TRANSITIONS: Record<string, readonly string[]> = {
  pending: ['in_transit', 'cancelled'],
  in_transit: ['completed', 'cancelled'],
};

export class InvalidStockTransferTransition extends Error {
  constructor(public readonly from: string, public readonly to: string) {
    super(`상태 전환 불가: ${from} → ${to}`);
    this.name = 'InvalidStockTransferTransition';
  }
}

export function assertValidStockTransferTransition(from: string, to: string): void {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new InvalidStockTransferTransition(from, to);
  }
}
