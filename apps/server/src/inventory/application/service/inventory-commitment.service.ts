import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type {
  InventoryAvailabilityBatch,
  InventoryCommitmentRead,
} from '@kiditem/shared/inventory-commitment';
import type { InventoryAvailabilityPort } from '../port/in/stock/inventory-availability.port';
import type {
  CreateRocketRequestCommitmentInput,
  InventoryCommitmentPort,
  ReleaseFinalOrderCommitmentsInput,
  ReleaseInventoryCommitmentsBySourceIdsInput,
  ReplaceRocketRequestWithFinalOrderInput,
  SettleFinalOrderCommitmentsInput,
} from '../port/in/stock/inventory-commitment.port';
import {
  INVENTORY_COMMITMENT_REPOSITORY_PORT,
  type InventoryCommitmentRepositoryPort,
} from '../port/out/repository/inventory-commitment.repository.port';

@Injectable()
export class InventoryCommitmentService
implements InventoryAvailabilityPort, InventoryCommitmentPort {
  constructor(
    @Inject(INVENTORY_COMMITMENT_REPOSITORY_PORT)
    private readonly repository: InventoryCommitmentRepositoryPort,
  ) {}

  findBySourceIds(input: {
    organizationId: string;
    sourceIds: string[];
  }): Promise<InventoryCommitmentRead[]> {
    assertUuid(input.organizationId, 'organizationId');
    const sourceIds = normalizeUuidList(input.sourceIds, 'sourceIds');
    if (sourceIds.length === 0) return Promise.resolve([]);
    return this.repository.findBySourceIds({
      organizationId: input.organizationId,
      sourceIds,
    });
  }

  findBySkuIds(input: {
    organizationId: string;
    sellpiaInventorySkuIds: string[];
  }): Promise<InventoryAvailabilityBatch> {
    assertUuid(input.organizationId, 'organizationId');
    const sellpiaInventorySkuIds = normalizeUuidList(
      input.sellpiaInventorySkuIds,
      'sellpiaInventorySkuIds',
    );
    return this.repository.findAvailability({
      organizationId: input.organizationId,
      sellpiaInventorySkuIds,
    });
  }

  async createRocketRequest(
    input: CreateRocketRequestCommitmentInput,
  ): Promise<{ commitmentId: string }> {
    validateActorAndSource(input);
    const identity = canonicalRocketIdentity(input);
    assertPositiveInteger(input.unitQuantity, 'unitQuantity');
    if (!/^\d+$/.test(input.inventoryGeneration)) {
      throw new BadRequestException('inventoryGeneration must be a decimal string');
    }
    if (input.allocations.length === 0) {
      throw new BadRequestException('allocations must not be empty');
    }
    const seenSkuIds = new Set<string>();
    for (const allocation of input.allocations) {
      assertUuid(allocation.sellpiaInventorySkuId, 'sellpiaInventorySkuId');
      assertPositiveInteger(allocation.unitsPerItem, 'unitsPerItem');
      assertPositiveInteger(allocation.quantity, 'quantity');
      if (allocation.quantity !== input.unitQuantity * allocation.unitsPerItem) {
        throw new BadRequestException(
          'allocation quantity must equal unitQuantity multiplied by unitsPerItem',
        );
      }
      if (seenSkuIds.has(allocation.sellpiaInventorySkuId)) {
        throw new BadRequestException('allocations contain a duplicate Sellpia SKU');
      }
      seenSkuIds.add(allocation.sellpiaInventorySkuId);
    }
    return this.repository.createRocketRequest({
      ...input,
      ...identity,
      allocations: [...input.allocations].sort((left, right) =>
        left.sellpiaInventorySkuId.localeCompare(right.sellpiaInventorySkuId)),
    });
  }

  async replaceRocketRequestWithFinalOrder(
    input: ReplaceRocketRequestWithFinalOrderInput,
  ): Promise<{ predecessorCommitmentId: string; commitmentId: string }> {
    assertUuid(input.organizationId, 'organizationId');
    assertUuid(input.userId, 'userId');
    assertUuid(input.finalOrderLineId, 'finalOrderLineId');
    assertUuid(input.channelAccountId, 'channelAccountId');
    assertPositiveInteger(input.unitQuantity, 'unitQuantity');
    const identity = canonicalRocketIdentity(input);
    const barcode = input.barcode?.trim() || null;
    return this.repository.replaceRocketRequestWithFinalOrder({
      ...input,
      ...identity,
      barcode,
    });
  }

  async releaseBySourceIds(
    input: ReleaseInventoryCommitmentsBySourceIdsInput,
  ): Promise<void> {
    assertUuid(input.organizationId, 'organizationId');
    assertUuid(input.userId, 'userId');
    const sourceIds = normalizeUuidList(input.sourceIds, 'sourceIds');
    if (sourceIds.length === 0) {
      throw new BadRequestException('sourceIds must not be empty');
    }
    const reason = requiredText(input.reason, 'reason');
    return this.repository.releaseBySourceIds({
      ...input,
      sourceIds,
      reason,
    });
  }

  async settleFinalOrders(input: SettleFinalOrderCommitmentsInput): Promise<void> {
    assertUuid(input.organizationId, 'organizationId');
    assertUuid(input.userId, 'userId');
    const commitmentIds = normalizeUuidList(input.commitmentIds, 'commitmentIds');
    if (commitmentIds.length === 0) {
      throw new BadRequestException('commitmentIds must not be empty');
    }
    return this.repository.settleFinalOrders({
      ...input,
      commitmentIds,
      reason: requiredText(input.reason, 'reason'),
    });
  }

  async releaseFinalOrders(
    input: ReleaseFinalOrderCommitmentsInput,
  ): Promise<void> {
    assertUuid(input.organizationId, 'organizationId');
    assertUuid(input.userId, 'userId');
    const commitmentIds = normalizeUuidList(input.commitmentIds, 'commitmentIds');
    if (commitmentIds.length === 0) {
      throw new BadRequestException('commitmentIds must not be empty');
    }
    return this.repository.releaseFinalOrders({
      ...input,
      commitmentIds,
      reason: requiredText(input.reason, 'reason'),
    });
  }
}

function canonicalRocketIdentity(input: {
  channelAccountId: string;
  poNumber: string;
  productNo: string;
}) {
  assertUuid(input.channelAccountId, 'channelAccountId');
  const poNumber = requiredText(input.poNumber, 'poNumber');
  const productNo = requiredText(input.productNo, 'productNo');
  return {
    poNumber,
    productNo,
    businessKey: `coupang-rocket:${input.channelAccountId}:${poNumber}:${productNo}`,
  };
}

function validateActorAndSource(input: {
  organizationId: string;
  userId: string;
  sourceLineId: string;
}): void {
  assertUuid(input.organizationId, 'organizationId');
  assertUuid(input.userId, 'userId');
  assertUuid(input.sourceLineId, 'sourceLineId');
}

function normalizeUuidList(values: string[], field: string): string[] {
  values.forEach((value) => assertUuid(value, field));
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function requiredText(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new BadRequestException(`${field} must not be blank`);
  }
  return normalized;
}

function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new BadRequestException(`${field} must be a positive integer`);
  }
}

function assertUuid(value: string, field: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new BadRequestException(`${field} must be a UUID`);
  }
}
