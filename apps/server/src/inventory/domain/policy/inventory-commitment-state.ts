export class InventoryCommitmentStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InventoryCommitmentStateError';
  }
}

export function calculateAvailableStock(
  currentStock: number,
  activeCommitmentQuantity: number,
): number {
  assertNonnegativeInteger(currentStock, 'currentStock');
  assertNonnegativeInteger(
    activeCommitmentQuantity,
    'activeCommitmentQuantity',
  );
  return Math.max(currentStock - activeCommitmentQuantity, 0);
}

export function calculateReplacementAvailableStock(input: {
  currentStock: number;
  activeCommitmentQuantity: number;
  predecessorQuantity: number;
}): number {
  assertNonnegativeInteger(input.predecessorQuantity, 'predecessorQuantity');
  const activeWithoutPredecessor = Math.max(
    input.activeCommitmentQuantity - input.predecessorQuantity,
    0,
  );
  return calculateAvailableStock(input.currentStock, activeWithoutPredecessor);
}

export function assertInventoryCommitmentCanBeReleased(status: string): void {
  if (status !== 'active') {
    throw new InventoryCommitmentStateError(
      'Only an active inventory commitment can be released',
    );
  }
}

export function assertInventoryCommitmentCanBeSettled(input: {
  kind: string;
  status: string;
  inventoryGeneration: bigint | null;
  verifiedGeneration: bigint;
  reason: string;
}): void {
  if (input.kind !== 'rocket_final_order') {
    throw new InventoryCommitmentStateError(
      'Only a rocket_final_order inventory commitment can be settled',
    );
  }
  if (input.status !== 'active') {
    throw new InventoryCommitmentStateError(
      'Only an active inventory commitment can be settled',
    );
  }
  if (input.reason.trim().length === 0) {
    throw new InventoryCommitmentStateError(
      'Inventory commitment settlement requires a reason',
    );
  }
  if (
    input.inventoryGeneration === null
    || input.verifiedGeneration <= input.inventoryGeneration
  ) {
    throw new InventoryCommitmentStateError(
      'A newer verified inventory generation is required before settlement',
    );
  }
}

function assertNonnegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new InventoryCommitmentStateError(
      `${name} must be a nonnegative integer`,
    );
  }
}
