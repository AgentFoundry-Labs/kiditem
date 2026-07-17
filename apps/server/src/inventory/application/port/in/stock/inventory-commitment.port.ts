import type {
  InventoryCommitmentKind,
} from '@kiditem/shared/inventory-commitment';

export type RocketCommitmentAllocationInput = {
  sellpiaInventorySkuId: string;
  unitsPerItem: number;
  quantity: number;
};

export type CreateRocketRequestCommitmentInput = {
  transaction: unknown;
  organizationId: string;
  userId: string;
  sourceLineId: string;
  channelAccountId: string;
  poNumber: string;
  productNo: string;
  unitQuantity: number;
  inventoryGeneration: string;
  allocations: RocketCommitmentAllocationInput[];
};

export type ReplaceRocketRequestWithFinalOrderInput = {
  transaction: unknown;
  organizationId: string;
  userId: string;
  finalOrderLineId: string;
  channelAccountId: string;
  poNumber: string;
  productNo: string;
  unitQuantity: number;
  barcode: string | null;
};

export type ReleaseInventoryCommitmentsBySourceIdsInput = {
  transaction: unknown;
  organizationId: string;
  userId: string;
  kind: InventoryCommitmentKind;
  sourceIds: string[];
  reason: string;
};

export type SettleFinalOrderCommitmentsInput = {
  organizationId: string;
  userId: string;
  commitmentIds: string[];
  reason: string;
};

export interface InventoryCommitmentPort {
  createRocketRequest(
    input: CreateRocketRequestCommitmentInput,
  ): Promise<{ commitmentId: string }>;

  replaceRocketRequestWithFinalOrder(
    input: ReplaceRocketRequestWithFinalOrderInput,
  ): Promise<{ predecessorCommitmentId: string; commitmentId: string }>;

  releaseBySourceIds(
    input: ReleaseInventoryCommitmentsBySourceIdsInput,
  ): Promise<void>;

  settleFinalOrders(input: SettleFinalOrderCommitmentsInput): Promise<void>;
}

export const INVENTORY_COMMITMENT_PORT = Symbol('INVENTORY_COMMITMENT_PORT');
