import type {
  CreateRocketRequestCommitmentInput,
} from '../../inventory/application/port/in/stock/inventory-commitment.port';

type RocketConfirmationLineForCommitment = {
  id: string;
  poNumber: string;
  productNo: string;
  confirmedQuantity: number;
  allocations: Array<{
    sellpiaInventorySkuId: string;
    unitsPerVariant: number;
    quantity: number;
  }>;
};

export function mapRocketRequestCommitment(input: {
  transaction: unknown;
  organizationId: string;
  userId: string;
  channelAccountId: string;
  inventoryGeneration: string;
  line: RocketConfirmationLineForCommitment;
}): CreateRocketRequestCommitmentInput {
  return {
    transaction: input.transaction,
    organizationId: input.organizationId,
    userId: input.userId,
    sourceLineId: input.line.id,
    channelAccountId: input.channelAccountId,
    poNumber: input.line.poNumber.trim(),
    productNo: input.line.productNo.trim(),
    unitQuantity: input.line.confirmedQuantity,
    inventoryGeneration: input.inventoryGeneration,
    allocations: input.line.allocations.map((allocation) => ({
      sellpiaInventorySkuId: allocation.sellpiaInventorySkuId,
      unitsPerItem: allocation.unitsPerVariant,
      quantity: allocation.quantity,
    })),
  };
}
