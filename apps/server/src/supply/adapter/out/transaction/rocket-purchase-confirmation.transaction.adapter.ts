import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  Prisma,
  type RocketPurchaseConfirmationLine,
} from '@prisma/client';
import {
  RocketPurchaseConfirmationRequestSchema,
  type RocketPurchaseConfirmationResponse,
  type RocketPurchasePreviewRow,
} from '@kiditem/shared/rocket-purchase-preview';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { RocketPurchaseCommitmentReadPort } from '../../../application/port/out/repository/rocket-purchase-commitment-read.port';
import type { RocketPurchaseConfirmationTransactionPort } from '../../../application/port/out/transaction/rocket-purchase-confirmation.transaction.port';

const LOCK_NAMESPACE = 'rocket-purchase-confirmation';

type ConfirmationRecord = Prisma.RocketPurchaseConfirmationGetPayload<{
  include: { lines: { include: { allocations: true } } };
}>;

type ConfirmationDecision = {
  source: RocketPurchasePreviewRow;
  confirmedQuantity: number;
  shortageReason: string | null;
  allocations: Array<{
    sellpiaInventorySkuId: string;
    unitsPerVariant: number;
    quantity: number;
  }>;
};

@Injectable()
export class RocketPurchaseConfirmationTransactionAdapter
implements RocketPurchaseConfirmationTransactionPort, RocketPurchaseCommitmentReadPort {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveQuantities(input: {
    organizationId: string;
    sellpiaInventorySkuIds: string[];
  }): Promise<Record<string, number>> {
    if (input.sellpiaInventorySkuIds.length === 0) return {};
    const rows = await this.prisma.rocketPurchaseConfirmationAllocation.groupBy({
      by: ['sellpiaInventorySkuId'],
      where: {
        organizationId: input.organizationId,
        sellpiaInventorySkuId: { in: input.sellpiaInventorySkuIds },
        confirmationLine: { confirmation: { status: 'active' } },
      },
      _sum: { quantity: true },
    });
    return Object.fromEntries(rows.map((row) => [
      row.sellpiaInventorySkuId,
      row._sum.quantity ?? 0,
    ]));
  }

  async confirm(
    input: Parameters<RocketPurchaseConfirmationTransactionPort['confirm']>[0],
  ): Promise<RocketPurchaseConfirmationResponse> {
    const request = RocketPurchaseConfirmationRequestSchema.parse(input.request);
    const requestHash = confirmationRequestHash({ ...input, request });
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtext(${LOCK_NAMESPACE}),
          hashtext(${input.organizationId})
        )
      `;
      await assertActiveActor(tx, input.organizationId, input.userId);

      const existing = await findConfirmation(
        tx,
        input.organizationId,
        request.idempotencyKey,
      );
      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new ConflictException(
            'Rocket confirmation idempotency key was already used for a different decision.',
          );
        }
        return confirmationResponse(existing, true);
      }

      await assertSourceArtifact(tx, {
        organizationId: input.organizationId,
        channelAccountId: request.channelAccountId,
        sourceImportRunId: input.sourceImportRunId,
      });
      await assertInventoryGeneration(
        tx,
        input.organizationId,
        input.preview.inventoryGeneration,
      );
      const decisions = buildDecisions(request, input.preview.rows);
      await assertCurrentRecipes(
        tx,
        input.organizationId,
        request.channelAccountId,
        decisions,
      );
      await assertAndLockCapacity(tx, input.organizationId, decisions);

      const created = await tx.rocketPurchaseConfirmation.create({
        data: {
          idempotencyKey: request.idempotencyKey,
          requestHash,
          freshnessGeneration: input.preview.inventoryGeneration === null
            ? null
            : BigInt(input.preview.inventoryGeneration),
          status: 'active',
          organization: { connect: { id: input.organizationId } },
          channelAccount: {
            connect: {
              id_organizationId: {
                id: request.channelAccountId,
                organizationId: input.organizationId,
              },
            },
          },
          sourceImportRun: {
            connect: {
              id_organizationId: {
                id: input.sourceImportRunId,
                organizationId: input.organizationId,
              },
            },
          },
          confirmer: { connect: { id: input.userId } },
          lines: {
            create: decisions.map((decision) => ({
              poLineId: decision.source.poLineId,
              poNumber: decision.source.poNumber,
              productNo: decision.source.productNo,
              productName: decision.source.productName,
              orderQuantity: decision.source.orderQuantity,
              confirmedQuantity: decision.confirmedQuantity,
              shortageReason: decision.shortageReason,
              organization: { connect: { id: input.organizationId } },
              ...(decision.source.channelSkuId ? {
                channelListingOption: {
                  connect: {
                    id_organizationId: {
                      id: decision.source.channelSkuId,
                      organizationId: input.organizationId,
                    },
                  },
                },
              } : {}),
              ...(decision.source.productVariantId ? {
                productVariant: {
                  connect: {
                    id_organizationId: {
                      id: decision.source.productVariantId,
                      organizationId: input.organizationId,
                    },
                  },
                },
              } : {}),
              allocations: {
                create: decision.allocations.map((allocation) => ({
                  unitsPerVariant: allocation.unitsPerVariant,
                  quantity: allocation.quantity,
                  organization: { connect: { id: input.organizationId } },
                  sellpiaInventorySku: {
                    connect: {
                      id_organizationId: {
                        id: allocation.sellpiaInventorySkuId,
                        organizationId: input.organizationId,
                      },
                    },
                  },
                })),
              },
            })),
          },
        },
        include: { lines: { include: { allocations: true } } },
      });
      return confirmationResponse(created, false);
    }, { maxWait: 10_000, timeout: 30_000 });
  }

  async release(
    input: Parameters<RocketPurchaseConfirmationTransactionPort['release']>[0],
  ): Promise<RocketPurchaseConfirmationResponse> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtext(${LOCK_NAMESPACE}),
          hashtext(${input.organizationId})
        )
      `;
      await assertActiveActor(tx, input.organizationId, input.userId);
      const existing = await tx.rocketPurchaseConfirmation.findFirst({
        where: { id: input.confirmationId, organizationId: input.organizationId },
        include: { lines: { include: { allocations: true } } },
      });
      if (!existing) {
        throw new NotFoundException('Rocket confirmation not found.');
      }
      if (existing.status === 'released') {
        return confirmationResponse(existing, true);
      }
      const released = await tx.rocketPurchaseConfirmation.update({
        where: { id: existing.id },
        data: {
          status: 'released',
          releasedBy: input.userId,
          releasedAt: new Date(),
          releaseReason: input.reason,
        },
        include: { lines: { include: { allocations: true } } },
      });
      return confirmationResponse(released, false);
    }, { maxWait: 10_000, timeout: 30_000 });
  }
}

async function assertActiveActor(
  tx: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
): Promise<void> {
  const membership = await tx.organizationMembership.findFirst({
    where: {
      organizationId,
      userId,
      status: 'active',
      user: { isActive: true },
    },
    select: { id: true },
  });
  if (!membership) {
    throw new UnauthorizedException('Active organization membership is required.');
  }
}

async function assertSourceArtifact(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    channelAccountId: string;
    sourceImportRunId: string;
  },
): Promise<void> {
  const run = await tx.sourceImportRun.findFirst({
    where: {
      id: input.sourceImportRunId,
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      sourceType: 'coupang_rocket_po_catalog',
      status: 'completed',
    },
    select: { id: true },
  });
  if (!run) {
    throw new BadRequestException('Completed Rocket PO source artifact not found.');
  }
}

async function assertInventoryGeneration(
  tx: Prisma.TransactionClient,
  organizationId: string,
  generation: string | null,
): Promise<void> {
  if (generation === null) return;
  const states = await tx.$queryRaw<Array<{ verifiedGeneration: bigint }>>`
    SELECT verified_generation AS "verifiedGeneration"
    FROM sellpia_inventory_states
    WHERE organization_id = ${organizationId}::uuid
    FOR UPDATE
  `;
  if (states[0]?.verifiedGeneration !== BigInt(generation)) {
    throw new ConflictException(
      'Sellpia inventory generation changed after Rocket preview.',
    );
  }
}

function buildDecisions(
  request: ReturnType<typeof RocketPurchaseConfirmationRequestSchema.parse>,
  previewRows: RocketPurchasePreviewRow[],
): ConfirmationDecision[] {
  const previewByLineId = new Map(previewRows.map((row) => [row.poLineId, row]));
  if (previewByLineId.size !== request.rows.length) {
    throw new ConflictException('Rocket preview rows changed before confirmation.');
  }
  return request.rows.map((requestRow) => {
    const source = previewByLineId.get(requestRow.poLineId);
    const confirmedQuantity = request.editedQuantities[requestRow.poLineId]!;
    if (!source || source.editedQuantity !== confirmedQuantity) {
      throw new ConflictException('Rocket preview quantity changed before confirmation.');
    }
    if (
      confirmedQuantity > 0
      && (
        !source.channelSkuId
        || !source.productVariantId
        || source.components.length === 0
        || source.components.some((component) => !component.isActive)
      )
    ) {
      throw new ConflictException(
        'Positive Rocket confirmation requires a current confirmed recipe.',
      );
    }
    return {
      source,
      confirmedQuantity,
      shortageReason: request.shortageReasons[requestRow.poLineId] ?? null,
      allocations: source.components.map((component) => ({
        sellpiaInventorySkuId: component.sellpiaInventorySkuId,
        unitsPerVariant: component.quantity,
        quantity: confirmedQuantity * component.quantity,
      })).filter(({ quantity }) => quantity > 0),
    };
  });
}

async function assertCurrentRecipes(
  tx: Prisma.TransactionClient,
  organizationId: string,
  channelAccountId: string,
  decisions: ConfirmationDecision[],
): Promise<void> {
  const positive = decisions.filter(({ confirmedQuantity }) => confirmedQuantity > 0);
  const variantIds = [...new Set(positive.flatMap(({ source }) =>
    source.productVariantId ? [source.productVariantId] : []))];
  if (variantIds.length === 0) return;
  const variants = await tx.productVariant.findMany({
    where: { id: { in: variantIds }, organizationId, isActive: true },
    select: {
      id: true,
      components: {
        select: { sellpiaInventorySkuId: true, quantity: true },
        orderBy: { sellpiaInventorySkuId: 'asc' },
      },
      channelListingOptions: {
        where: {
          organizationId,
          isActive: true,
          listing: { channelAccountId, isActive: true },
        },
        select: { id: true },
      },
    },
  });
  const byId = new Map(variants.map((variant) => [variant.id, variant]));
  for (const decision of positive) {
    const variant = byId.get(decision.source.productVariantId!);
    const expected = decision.source.components
      .map(({ sellpiaInventorySkuId, quantity }) => ({ sellpiaInventorySkuId, quantity }))
      .sort((left, right) => left.sellpiaInventorySkuId.localeCompare(right.sellpiaInventorySkuId));
    if (
      !variant
      || !variant.channelListingOptions.some(({ id }) => id === decision.source.channelSkuId)
      || JSON.stringify(variant.components) !== JSON.stringify(expected)
    ) {
      throw new ConflictException(
        'ProductVariant recipe changed after Rocket preview.',
      );
    }
  }
}

async function assertAndLockCapacity(
  tx: Prisma.TransactionClient,
  organizationId: string,
  decisions: ConfirmationDecision[],
): Promise<void> {
  const requested = new Map<string, number>();
  for (const allocation of decisions.flatMap(({ allocations }) => allocations)) {
    requested.set(
      allocation.sellpiaInventorySkuId,
      (requested.get(allocation.sellpiaInventorySkuId) ?? 0) + allocation.quantity,
    );
  }
  const ids = [...requested.keys()].sort();
  if (ids.length === 0) return;
  await tx.$queryRaw`
    SELECT id
    FROM sellpia_inventory_skus
    WHERE organization_id = ${organizationId}::uuid
      AND id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
    ORDER BY id
    FOR UPDATE
  `;
  const [inventorySkus, committedRows] = await Promise.all([
    tx.sellpiaInventorySku.findMany({
      where: { organizationId, id: { in: ids } },
      select: { id: true, currentStock: true, isActive: true },
    }),
    tx.rocketPurchaseConfirmationAllocation.groupBy({
      by: ['sellpiaInventorySkuId'],
      where: {
        organizationId,
        sellpiaInventorySkuId: { in: ids },
        confirmationLine: { confirmation: { status: 'active' } },
      },
      _sum: { quantity: true },
    }),
  ]);
  const inventoryById = new Map(inventorySkus.map((sku) => [sku.id, sku]));
  const committedById = new Map(committedRows.map((row) => [
    row.sellpiaInventorySkuId,
    row._sum.quantity ?? 0,
  ]));
  for (const [id, quantity] of requested) {
    const sku = inventoryById.get(id);
    const available = sku?.isActive
      ? sku.currentStock - (committedById.get(id) ?? 0)
      : 0;
    if (!sku || available < quantity) {
      throw new ConflictException(
        'Rocket confirmation exceeds current component capacity.',
      );
    }
  }
}

async function findConfirmation(
  tx: Prisma.TransactionClient,
  organizationId: string,
  idempotencyKey: string,
): Promise<ConfirmationRecord | null> {
  return tx.rocketPurchaseConfirmation.findUnique({
    where: { organizationId_idempotencyKey: { organizationId, idempotencyKey } },
    include: { lines: { include: { allocations: true } } },
  });
}

function confirmationResponse(
  confirmation: ConfirmationRecord,
  duplicate: boolean,
): RocketPurchaseConfirmationResponse {
  const lines = [...confirmation.lines].sort((left, right) =>
    left.poLineId.localeCompare(right.poLineId));
  return {
    confirmationId: confirmation.id,
    status: confirmation.status === 'released' ? 'released' : 'active',
    duplicate,
    inventoryGeneration: confirmation.freshnessGeneration?.toString() ?? null,
    confirmedAt: confirmation.confirmedAt.toISOString(),
    totals: {
      lineCount: lines.length,
      orderQuantity: sumLines(lines, 'orderQuantity'),
      confirmedQuantity: sumLines(lines, 'confirmedQuantity'),
      allocatedQuantity: lines.reduce((sum, line) => sum
        + line.allocations.reduce((lineSum, allocation) => lineSum + allocation.quantity, 0), 0),
    },
    rows: lines.map((line) => ({
      poLineId: line.poLineId,
      confirmedQuantity: line.confirmedQuantity,
      shortageReason: line.shortageReason as RocketPurchaseConfirmationResponse['rows'][number]['shortageReason'],
    })),
  } satisfies RocketPurchaseConfirmationResponse;
}

function sumLines(
  lines: RocketPurchaseConfirmationLine[],
  field: 'orderQuantity' | 'confirmedQuantity',
): number {
  return lines.reduce((sum, line) => sum + line[field], 0);
}

function confirmationRequestHash(
  input: Parameters<RocketPurchaseConfirmationTransactionPort['confirm']>[0],
): string {
  const previewByLineId = new Map(input.preview.rows.map((row) => [row.poLineId, row]));
  const canonical = input.request.rows.map((row) => {
    const preview = previewByLineId.get(row.poLineId);
    return {
      poLineId: row.poLineId,
      sourceEvidence: {
        poNumber: row.poNumber,
        vendorId: row.vendorId,
        productNo: row.productNo,
        barcode: row.barcode,
        productName: row.productName,
        plannedDeliveryDate: row.plannedDeliveryDate,
        poStatusCode: row.poStatusCode ?? null,
        businessDateBasis: row.businessDateBasis ?? null,
        confirmation: row.confirmation ?? null,
      },
      orderQuantity: row.orderQty,
      confirmedQuantity: input.request.editedQuantities[row.poLineId],
      shortageReason: input.request.shortageReasons[row.poLineId] ?? null,
      channelSkuId: preview?.channelSkuId ?? null,
      productVariantId: preview?.productVariantId ?? null,
      components: [...(preview?.components ?? [])]
        .map(({ sellpiaInventorySkuId, quantity }) => ({ sellpiaInventorySkuId, quantity }))
        .sort((left, right) => left.sellpiaInventorySkuId.localeCompare(right.sellpiaInventorySkuId)),
    };
  }).sort((left, right) => left.poLineId.localeCompare(right.poLineId));
  return createHash('sha256').update(JSON.stringify({
    channelAccountId: input.request.channelAccountId,
    sourceImportRunId: input.sourceImportRunId,
    inventoryGeneration: input.preview.inventoryGeneration,
    rows: canonical,
  })).digest('hex');
}
