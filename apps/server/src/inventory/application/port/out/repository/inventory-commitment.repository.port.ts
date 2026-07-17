import type {
  InventoryAvailabilityBatch,
  InventoryCommitmentRead,
} from '@kiditem/shared/inventory-commitment';
import type {
  CreateRocketRequestCommitmentInput,
  ReleaseFinalOrderCommitmentsInput,
  ReleaseInventoryCommitmentsBySourceIdsInput,
  ReplaceRocketRequestWithFinalOrderInput,
  SettleFinalOrderCommitmentsInput,
} from '../../in/stock/inventory-commitment.port';

type CanonicalRocketIdentity = {
  businessKey: string;
  poNumber: string;
  productNo: string;
};

export interface InventoryCommitmentRepositoryPort {
  findBySourceIds(input: {
    organizationId: string;
    sourceIds: string[];
  }): Promise<InventoryCommitmentRead[]>;

  findAvailability(input: {
    organizationId: string;
    sellpiaInventorySkuIds: string[];
  }): Promise<InventoryAvailabilityBatch>;

  createRocketRequest(
    input: CreateRocketRequestCommitmentInput & CanonicalRocketIdentity,
  ): Promise<{ commitmentId: string }>;

  replaceRocketRequestWithFinalOrder(
    input: ReplaceRocketRequestWithFinalOrderInput & CanonicalRocketIdentity,
  ): Promise<{ predecessorCommitmentId: string; commitmentId: string }>;

  releaseBySourceIds(
    input: ReleaseInventoryCommitmentsBySourceIdsInput,
  ): Promise<void>;

  settleFinalOrders(input: SettleFinalOrderCommitmentsInput): Promise<void>;

  releaseFinalOrders(input: ReleaseFinalOrderCommitmentsInput): Promise<void>;
}

export const INVENTORY_COMMITMENT_REPOSITORY_PORT = Symbol(
  'INVENTORY_COMMITMENT_REPOSITORY_PORT',
);
