export interface RocketPurchaseCommitmentReadPort {
  findActiveQuantities(input: {
    organizationId: string;
    sellpiaInventorySkuIds: string[];
  }): Promise<Record<string, number>>;
}

export const ROCKET_PURCHASE_COMMITMENT_READ_PORT = Symbol(
  'ROCKET_PURCHASE_COMMITMENT_READ_PORT',
);
