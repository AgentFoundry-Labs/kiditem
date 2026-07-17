import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  InventoryAvailabilityBatchSchema,
  type InventoryAvailabilityBatch,
  InventoryCommitmentReadSchema,
  type InventoryCommitmentRead,
} from '@kiditem/shared/inventory-commitment';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { InventoryCommitmentRepositoryPort } from '../../../application/port/out/repository/inventory-commitment.repository.port';
import {
  assertInventoryCommitmentCanBeReleased,
  assertInventoryCommitmentCanBeSettled,
  calculateAvailableStock,
  calculateReplacementAvailableStock,
  InventoryCommitmentStateError,
} from '../../../domain/policy/inventory-commitment-state';
import { lockSellpiaInventoryTransaction } from './sellpia-inventory-transaction-lock';

const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;
const REQUEST_REPLACED_REASON = '쿠팡 발주확정 주문 전환';

type CreateRequestInput = Parameters<
  InventoryCommitmentRepositoryPort['createRocketRequest']
>[0];
type ReplaceRequestInput = Parameters<
  InventoryCommitmentRepositoryPort['replaceRocketRequestWithFinalOrder']
>[0];
type ReleaseInput = Parameters<
  InventoryCommitmentRepositoryPort['releaseBySourceIds']
>[0];
type SettleInput = Parameters<
  InventoryCommitmentRepositoryPort['settleFinalOrders']
>[0];
type ReleaseFinalInput = Parameters<
  InventoryCommitmentRepositoryPort['releaseFinalOrders']
>[0];

type InventorySkuRow = {
  id: string;
  currentStock: number;
  isActive: boolean;
};

type CommitmentWithAllocations = Prisma.InventoryCommitmentGetPayload<{
  include: { allocations: true };
}>;

@Injectable()
export class InventoryCommitmentRepositoryAdapter
implements InventoryCommitmentRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  findBySourceIds(input: {
    organizationId: string;
    sourceIds: string[];
  }): Promise<InventoryCommitmentRead[]> {
    return this.prisma.$transaction(async (tx) => {
      await lockSellpiaInventoryTransaction(tx, input.organizationId);
      const commitments = await tx.inventoryCommitment.findMany({
        where: {
          organizationId: input.organizationId,
          OR: [
            { sourceId: { in: input.sourceIds } },
            {
              predecessor: {
                is: {
                  organizationId: input.organizationId,
                  sourceId: { in: input.sourceIds },
                },
              },
            },
          ],
        },
        include: {
          creator: { select: { id: true, name: true } },
          releaser: { select: { id: true, name: true } },
          settler: { select: { id: true, name: true } },
          allocations: {
            include: {
              sellpiaInventorySku: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  optionName: true,
                  currentStock: true,
                  isActive: true,
                },
              },
            },
            orderBy: { sellpiaInventorySkuId: 'asc' },
          },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      if (commitments.length === 0) return [];

      const skuIds = [...new Set(commitments.flatMap((commitment) =>
        commitment.allocations.map(({ sellpiaInventorySkuId }) =>
          sellpiaInventorySkuId)))];
      const activeBySkuId = await activeCommitmentQuantities(
        tx,
        input.organizationId,
        skuIds,
      );
      const state = await tx.sellpiaInventoryState.findUnique({
        where: { organizationId: input.organizationId },
        select: { verifiedGeneration: true, lastVerifiedAt: true },
      });
      const verifiedGeneration = state?.lastVerifiedAt
        ? state.verifiedGeneration
        : 0n;

      return commitments.map((commitment) =>
        InventoryCommitmentReadSchema.parse({
          id: commitment.id,
          sourceId: commitment.sourceId,
          predecessorCommitmentId: commitment.predecessorCommitmentId,
          kind: commitment.kind,
          status: commitment.status,
          unitQuantity: commitment.unitQuantity,
          inventoryGeneration: commitment.inventoryGeneration?.toString() ?? null,
          createdBy: commitment.creator,
          createdAt: commitment.createdAt.toISOString(),
          releasedBy: commitment.releaser,
          releasedAt: commitment.releasedAt?.toISOString() ?? null,
          releaseReason: commitment.releaseReason,
          settledBy: commitment.settler,
          settledAt: commitment.settledAt?.toISOString() ?? null,
          settlementReason: commitment.settlementReason,
          canRelease: commitment.status === 'active',
          canSettle: canSettleCommitment(commitment, verifiedGeneration),
          allocations: commitment.allocations.map((allocation) => {
            const sku = allocation.sellpiaInventorySku;
            const activeCommitmentQuantity = activeBySkuId.get(sku.id) ?? 0;
            return {
              sellpiaInventorySkuId: sku.id,
              code: sku.code,
              name: sku.name,
              optionName: sku.optionName,
              unitsPerItem: allocation.unitsPerItem,
              quantity: allocation.quantity,
              currentStock: sku.currentStock,
              activeCommitmentQuantity,
              availableStock: calculateAvailableStock(
                sku.currentStock,
                activeCommitmentQuantity,
              ),
              isActive: sku.isActive,
            };
          }),
        }));
    }, TRANSACTION_OPTIONS);
  }

  findAvailability(input: {
    organizationId: string;
    sellpiaInventorySkuIds: string[];
  }): Promise<InventoryAvailabilityBatch> {
    return this.prisma.$transaction(async (tx) => {
      await lockSellpiaInventoryTransaction(tx, input.organizationId);
      const inventorySkus = await loadInventorySkus(
        tx,
        input.organizationId,
        input.sellpiaInventorySkuIds,
        false,
      );
      const state = await tx.sellpiaInventoryState.findUnique({
        where: { organizationId: input.organizationId },
        select: { verifiedGeneration: true, lastVerifiedAt: true },
      });
      if (
        state === null
        || state.verifiedGeneration <= 0n
        || state.lastVerifiedAt === null
      ) {
        return InventoryAvailabilityBatchSchema.parse({
          snapshot: { collected: false, generation: null, verifiedAt: null },
          items: [],
        });
      }

      const activeBySkuId = await activeCommitmentQuantities(
        tx,
        input.organizationId,
        input.sellpiaInventorySkuIds,
      );
      const generation = state.verifiedGeneration.toString();
      return InventoryAvailabilityBatchSchema.parse({
        snapshot: {
          collected: true,
          generation,
          verifiedAt: state.lastVerifiedAt.toISOString(),
        },
        items: inventorySkus.map((sku) => {
          const activeCommitmentQuantity = activeBySkuId.get(sku.id) ?? 0;
          return {
            sellpiaInventorySkuId: sku.id,
            currentStock: sku.currentStock,
            activeCommitmentQuantity,
            availableStock: calculateAvailableStock(
              sku.currentStock,
              activeCommitmentQuantity,
            ),
            isActive: sku.isActive,
            generation,
          };
        }),
      });
    }, TRANSACTION_OPTIONS);
  }

  createRocketRequest(
    input: CreateRequestInput,
  ): Promise<{ commitmentId: string }> {
    const tx = transactionClient(input.transaction);
    return this.createRocketRequestInTransaction(tx, input);
  }

  private async createRocketRequestInTransaction(
    tx: Prisma.TransactionClient,
    input: CreateRequestInput,
  ): Promise<{ commitmentId: string }> {
    await lockSellpiaInventoryTransaction(tx, input.organizationId);
    const existing = await tx.inventoryCommitment.findFirst({
      where: {
        organizationId: input.organizationId,
        kind: 'rocket_request',
        sourceId: input.sourceLineId,
      },
      include: { allocations: true },
    });
    if (existing) {
      assertIdempotentRequest(existing, input);
      return { commitmentId: existing.id };
    }

    const activeBusinessCommitment = await tx.inventoryCommitment.findFirst({
      where: {
        organizationId: input.organizationId,
        businessKey: input.businessKey,
        status: 'active',
      },
      select: { id: true },
    });
    if (activeBusinessCommitment) {
      throw new ConflictException(
        'An active inventory commitment already exists for this Rocket business key',
      );
    }

    const state = await requireCollectedInventoryState(tx, input.organizationId);
    if (state.verifiedGeneration.toString() !== input.inventoryGeneration) {
      throw new ConflictException(
        'The Sellpia inventory generation changed before commitment creation',
      );
    }
    const sellpiaInventorySkuIds = input.allocations.map(
      ({ sellpiaInventorySkuId }) => sellpiaInventorySkuId,
    );
    const inventorySkus = await loadInventorySkus(
      tx,
      input.organizationId,
      sellpiaInventorySkuIds,
      true,
    );
    const activeBySkuId = await activeCommitmentQuantities(
      tx,
      input.organizationId,
      sellpiaInventorySkuIds,
    );
    assertAllocationCapacity(
      inventorySkus,
      input.allocations,
      activeBySkuId,
    );

    const commitment = await tx.inventoryCommitment.create({
      data: {
        organizationId: input.organizationId,
        kind: 'rocket_request',
        sourceId: input.sourceLineId,
        businessKey: input.businessKey,
        unitQuantity: input.unitQuantity,
        status: 'active',
        inventoryGeneration: BigInt(input.inventoryGeneration),
        createdBy: input.userId,
      },
      select: { id: true },
    });
    await tx.inventoryCommitmentAllocation.createMany({
      data: input.allocations.map((allocation) => ({
        organizationId: input.organizationId,
        commitmentId: commitment.id,
        sellpiaInventorySkuId: allocation.sellpiaInventorySkuId,
        unitsPerItem: allocation.unitsPerItem,
        quantity: allocation.quantity,
      })),
    });
    return { commitmentId: commitment.id };
  }

  replaceRocketRequestWithFinalOrder(
    input: ReplaceRequestInput,
  ): Promise<{ predecessorCommitmentId: string; commitmentId: string }> {
    const tx = transactionClient(input.transaction);
    return this.replaceRocketRequestWithFinalOrderInTransaction(tx, input);
  }

  private async replaceRocketRequestWithFinalOrderInTransaction(
    tx: Prisma.TransactionClient,
    input: ReplaceRequestInput,
  ): Promise<{ predecessorCommitmentId: string; commitmentId: string }> {
    await lockSellpiaInventoryTransaction(tx, input.organizationId);
    const existingFinal = await tx.inventoryCommitment.findFirst({
      where: {
        organizationId: input.organizationId,
        kind: 'rocket_final_order',
        sourceId: input.finalOrderLineId,
      },
      include: { allocations: true },
    });
    if (existingFinal) {
      assertIdempotentFinalOrder(existingFinal, input);
      return {
        predecessorCommitmentId: existingFinal.predecessorCommitmentId!,
        commitmentId: existingFinal.id,
      };
    }

    const predecessor = await tx.inventoryCommitment.findFirst({
      where: {
        organizationId: input.organizationId,
        kind: 'rocket_request',
        businessKey: input.businessKey,
        status: 'active',
      },
      include: { allocations: true },
    });
    if (!predecessor) {
      throw new ConflictException(
        'An active Rocket request commitment was not found for the final order',
      );
    }
    const sellpiaInventorySkuIds = predecessor.allocations
      .map(({ sellpiaInventorySkuId }) => sellpiaInventorySkuId)
      .sort((left, right) => left.localeCompare(right));
    const inventorySkus = await loadInventorySkus(
      tx,
      input.organizationId,
      sellpiaInventorySkuIds,
      true,
    );
    const activeBySkuId = await activeCommitmentQuantities(
      tx,
      input.organizationId,
      sellpiaInventorySkuIds,
    );
    for (const allocation of predecessor.allocations) {
      const sku = inventorySkus.find(({ id }) => id === allocation.sellpiaInventorySkuId)!;
      if (!sku.isActive) {
        throw new ConflictException('A Sellpia inventory SKU is inactive');
      }
      const replacementAvailableStock = calculateReplacementAvailableStock({
        currentStock: sku.currentStock,
        activeCommitmentQuantity: activeBySkuId.get(sku.id) ?? 0,
        predecessorQuantity: allocation.quantity,
      });
      const requestedQuantity = input.unitQuantity * allocation.unitsPerItem;
      if (requestedQuantity > replacementAvailableStock) {
        throw new ConflictException(
          'The final Rocket order exceeds available Sellpia inventory',
        );
      }
    }

    const state = await requireCollectedInventoryState(tx, input.organizationId);
    const released = await tx.inventoryCommitment.updateMany({
      where: {
        id: predecessor.id,
        organizationId: input.organizationId,
        status: 'active',
      },
      data: {
        status: 'released',
        releasedBy: input.userId,
        releasedAt: new Date(),
        releaseReason: REQUEST_REPLACED_REASON,
      },
    });
    if (released.count !== 1) {
      throw new ConflictException('The Rocket request commitment changed during replacement');
    }

    const commitment = await tx.inventoryCommitment.create({
      data: {
        organizationId: input.organizationId,
        kind: 'rocket_final_order',
        sourceId: input.finalOrderLineId,
        businessKey: input.businessKey,
        unitQuantity: input.unitQuantity,
        status: 'active',
        inventoryGeneration: state.verifiedGeneration,
        predecessorCommitmentId: predecessor.id,
        createdBy: input.userId,
      },
      select: { id: true },
    });
    await tx.inventoryCommitmentAllocation.createMany({
      data: predecessor.allocations.map((allocation) => ({
        organizationId: input.organizationId,
        commitmentId: commitment.id,
        sellpiaInventorySkuId: allocation.sellpiaInventorySkuId,
        unitsPerItem: allocation.unitsPerItem,
        quantity: input.unitQuantity * allocation.unitsPerItem,
      })),
    });
    return {
      predecessorCommitmentId: predecessor.id,
      commitmentId: commitment.id,
    };
  }

  releaseBySourceIds(input: ReleaseInput): Promise<void> {
    const tx = transactionClient(input.transaction);
    return this.releaseBySourceIdsInTransaction(tx, input);
  }

  private async releaseBySourceIdsInTransaction(
    tx: Prisma.TransactionClient,
    input: ReleaseInput,
  ): Promise<void> {
    await lockSellpiaInventoryTransaction(tx, input.organizationId);
    const commitments = await tx.inventoryCommitment.findMany({
      where: {
        organizationId: input.organizationId,
        kind: input.kind,
        sourceId: { in: input.sourceIds },
      },
      include: { allocations: true },
    });
    if (commitments.length !== input.sourceIds.length) {
      throw new NotFoundException('One or more inventory commitments were not found');
    }
    await lockCommitmentSkus(tx, input.organizationId, commitments);
    const activeIds: string[] = [];
    for (const commitment of commitments) {
      if (commitment.status === 'released') continue;
      assertReleaseAllowed(commitment.status);
      activeIds.push(commitment.id);
    }
    if (activeIds.length === 0) return;
    const released = await tx.inventoryCommitment.updateMany({
      where: {
        organizationId: input.organizationId,
        id: { in: activeIds },
        status: 'active',
      },
      data: {
        status: 'released',
        releasedBy: input.userId,
        releasedAt: new Date(),
        releaseReason: input.reason,
      },
    });
    if (released.count !== activeIds.length) {
      throw new ConflictException('Inventory commitments changed during release');
    }
  }

  settleFinalOrders(input: SettleInput): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      await lockSellpiaInventoryTransaction(tx, input.organizationId);
      const commitments = await tx.inventoryCommitment.findMany({
        where: {
          organizationId: input.organizationId,
          id: { in: input.commitmentIds },
        },
        include: { allocations: true },
      });
      if (commitments.length !== input.commitmentIds.length) {
        throw new NotFoundException('One or more inventory commitments were not found');
      }
      await lockCommitmentSkus(tx, input.organizationId, commitments);
      const state = await requireCollectedInventoryState(tx, input.organizationId);
      for (const commitment of commitments) {
        try {
          assertInventoryCommitmentCanBeSettled({
            kind: commitment.kind,
            status: commitment.status,
            inventoryGeneration: commitment.inventoryGeneration,
            verifiedGeneration: state.verifiedGeneration,
            reason: input.reason,
          });
        } catch (error) {
          throwStateConflict(error);
        }
      }
      const settled = await tx.inventoryCommitment.updateMany({
        where: {
          organizationId: input.organizationId,
          id: { in: input.commitmentIds },
          kind: 'rocket_final_order',
          status: 'active',
        },
        data: {
          status: 'settled',
          settledBy: input.userId,
          settledAt: new Date(),
          settlementReason: input.reason,
        },
      });
      if (settled.count !== input.commitmentIds.length) {
        throw new ConflictException('Inventory commitments changed during settlement');
      }
    }, TRANSACTION_OPTIONS);
  }

  releaseFinalOrders(input: ReleaseFinalInput): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      await lockSellpiaInventoryTransaction(tx, input.organizationId);
      const commitments = await tx.inventoryCommitment.findMany({
        where: {
          organizationId: input.organizationId,
          id: { in: input.commitmentIds },
        },
        include: { allocations: true },
      });
      if (commitments.length !== input.commitmentIds.length) {
        throw new NotFoundException('One or more inventory commitments were not found');
      }
      await lockCommitmentSkus(tx, input.organizationId, commitments);
      const activeIds: string[] = [];
      for (const commitment of commitments) {
        if (commitment.kind !== 'rocket_final_order') {
          throw new ConflictException(
            'Only Rocket final-order commitments can be released by this action',
          );
        }
        if (commitment.status === 'released') continue;
        assertReleaseAllowed(commitment.status);
        activeIds.push(commitment.id);
      }
      if (activeIds.length === 0) return;
      const released = await tx.inventoryCommitment.updateMany({
        where: {
          organizationId: input.organizationId,
          id: { in: activeIds },
          kind: 'rocket_final_order',
          status: 'active',
        },
        data: {
          status: 'released',
          releasedBy: input.userId,
          releasedAt: new Date(),
          releaseReason: input.reason,
        },
      });
      if (released.count !== activeIds.length) {
        throw new ConflictException('Inventory commitments changed during release');
      }
    }, TRANSACTION_OPTIONS);
  }
}

async function loadInventorySkus(
  tx: Prisma.TransactionClient,
  organizationId: string,
  sellpiaInventorySkuIds: string[],
  lockRows: boolean,
): Promise<InventorySkuRow[]> {
  if (sellpiaInventorySkuIds.length === 0) return [];
  const ids = [...new Set(sellpiaInventorySkuIds)]
    .sort((left, right) => left.localeCompare(right));
  if (lockRows) {
    const idList = Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`));
    await tx.$queryRaw(Prisma.sql`
      SELECT id
      FROM sellpia_inventory_skus
      WHERE organization_id = ${organizationId}::uuid
        AND id IN (${idList})
      ORDER BY id
      FOR UPDATE
    `);
  }
  const rows = await tx.sellpiaInventorySku.findMany({
    where: { organizationId, id: { in: ids } },
    orderBy: { id: 'asc' },
    select: { id: true, currentStock: true, isActive: true },
  });
  if (rows.length !== ids.length) {
    throw new NotFoundException(
      'One or more Sellpia inventory SKUs were not found in this organization',
    );
  }
  return rows;
}

async function activeCommitmentQuantities(
  tx: Prisma.TransactionClient,
  organizationId: string,
  sellpiaInventorySkuIds: string[],
): Promise<Map<string, number>> {
  if (sellpiaInventorySkuIds.length === 0) return new Map();
  const totals = await tx.inventoryCommitmentAllocation.groupBy({
    by: ['sellpiaInventorySkuId'],
    where: {
      organizationId,
      sellpiaInventorySkuId: { in: sellpiaInventorySkuIds },
      commitment: {
        is: { organizationId, status: 'active' },
      },
    },
    _sum: { quantity: true },
  });
  return new Map(totals.map((total) => [
    total.sellpiaInventorySkuId,
    total._sum.quantity ?? 0,
  ]));
}

async function requireCollectedInventoryState(
  tx: Prisma.TransactionClient,
  organizationId: string,
) {
  const state = await tx.sellpiaInventoryState.findUnique({
    where: { organizationId },
    select: { verifiedGeneration: true, lastVerifiedAt: true },
  });
  if (!state || state.verifiedGeneration <= 0n || state.lastVerifiedAt === null) {
    throw new ConflictException('A collected Sellpia inventory snapshot is required');
  }
  return state;
}

function assertAllocationCapacity(
  inventorySkus: InventorySkuRow[],
  allocations: CreateRequestInput['allocations'],
  activeBySkuId: Map<string, number>,
): void {
  for (const allocation of allocations) {
    const sku = inventorySkus.find(({ id }) => id === allocation.sellpiaInventorySkuId)!;
    if (!sku.isActive) {
      throw new ConflictException('A Sellpia inventory SKU is inactive');
    }
    const availableStock = calculateAvailableStock(
      sku.currentStock,
      activeBySkuId.get(sku.id) ?? 0,
    );
    if (allocation.quantity > availableStock) {
      throw new ConflictException(
        'The Rocket request exceeds available Sellpia inventory',
      );
    }
  }
}

function assertIdempotentRequest(
  existing: CommitmentWithAllocations,
  input: CreateRequestInput,
): void {
  const expectedGeneration = BigInt(input.inventoryGeneration);
  if (
    existing.businessKey !== input.businessKey
    || existing.unitQuantity !== input.unitQuantity
    || existing.inventoryGeneration !== expectedGeneration
    || !allocationsEqual(existing.allocations, input.allocations)
  ) {
    throw new ConflictException(
      'The Rocket request source was already committed with different data',
    );
  }
}

function assertIdempotentFinalOrder(
  existing: CommitmentWithAllocations,
  input: ReplaceRequestInput,
): void {
  if (
    existing.businessKey !== input.businessKey
    || existing.unitQuantity !== input.unitQuantity
    || existing.predecessorCommitmentId === null
    || existing.allocations.some((allocation) =>
      allocation.quantity !== input.unitQuantity * allocation.unitsPerItem)
  ) {
    throw new ConflictException(
      'The final Rocket order source was already committed with different data',
    );
  }
}

function allocationsEqual(
  existing: CommitmentWithAllocations['allocations'],
  expected: CreateRequestInput['allocations'],
): boolean {
  if (existing.length !== expected.length) return false;
  const expectedBySkuId = new Map(
    expected.map((allocation) => [allocation.sellpiaInventorySkuId, allocation]),
  );
  return existing.every((allocation) => {
    const match = expectedBySkuId.get(allocation.sellpiaInventorySkuId);
    return match !== undefined
      && match.unitsPerItem === allocation.unitsPerItem
      && match.quantity === allocation.quantity;
  });
}

async function lockCommitmentSkus(
  tx: Prisma.TransactionClient,
  organizationId: string,
  commitments: CommitmentWithAllocations[],
): Promise<void> {
  await loadInventorySkus(
    tx,
    organizationId,
    commitments.flatMap((commitment) =>
      commitment.allocations.map(({ sellpiaInventorySkuId }) => sellpiaInventorySkuId)),
    true,
  );
}

function assertReleaseAllowed(status: string): void {
  try {
    assertInventoryCommitmentCanBeReleased(status);
  } catch (error) {
    throwStateConflict(error);
  }
}

function throwStateConflict(error: unknown): never {
  if (error instanceof InventoryCommitmentStateError) {
    throw new ConflictException(error.message);
  }
  throw error;
}

function canSettleCommitment(
  commitment: {
    kind: string;
    status: string;
    inventoryGeneration: bigint | null;
  },
  verifiedGeneration: bigint,
): boolean {
  try {
    assertInventoryCommitmentCanBeSettled({
      ...commitment,
      verifiedGeneration,
      reason: 'read-policy-check',
    });
    return true;
  } catch (error) {
    if (error instanceof InventoryCommitmentStateError) return false;
    throw error;
  }
}

function transactionClient(value: unknown): Prisma.TransactionClient {
  if (
    typeof value !== 'object'
    || value === null
    || !('$queryRaw' in value)
    || !('inventoryCommitment' in value)
  ) {
    throw new ConflictException('An active inventory transaction is required');
  }
  return value as Prisma.TransactionClient;
}
