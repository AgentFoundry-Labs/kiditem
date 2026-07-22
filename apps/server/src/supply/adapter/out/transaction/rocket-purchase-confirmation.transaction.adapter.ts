import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, type RocketPurchaseConfirmationLine } from '@prisma/client';
import {
  RocketWorkbookExportRequestSchema,
  type RocketWorkbookExportResponse,
  type RocketWorkbookWorkflowStatus,
  type RocketPurchasePreviewRow,
} from '@kiditem/shared/rocket-purchase-preview';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  ROCKET_WORKBOOK_PROGRESS_PORT,
  type RocketWorkbookProgressPort,
} from '../../../../inventory/application/port/in/stock/rocket-workbook-progress.port';
import type { RocketWorkbookExportTransactionPort } from '../../../application/port/out/transaction/rocket-purchase-confirmation.transaction.port';

const LOCK_NAMESPACE = 'rocket-workbook-workflow';
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;
const TERMINAL_STATUSES = ['completed', 'released'] as const;

type ExportRecord = Prisma.RocketPurchaseConfirmationGetPayload<{
  include: {
    lines: { include: { allocations: true } };
    transmissions: true;
  };
}>;

type WorkbookDecision = {
  source: RocketPurchasePreviewRow;
  barcode: string | null;
  workbookQuantity: number;
  shortageReason: string | null;
  allocations: Array<{
    sellpiaInventorySkuId: string;
    unitsPerVariant: number;
    quantity: number;
  }>;
};

@Injectable()
export class RocketPurchaseConfirmationTransactionAdapter
implements RocketWorkbookExportTransactionPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ROCKET_WORKBOOK_PROGRESS_PORT)
    private readonly progress: RocketWorkbookProgressPort,
  ) {}

  async exportWorkbook(
    input: Parameters<RocketWorkbookExportTransactionPort['exportWorkbook']>[0],
  ): Promise<RocketWorkbookExportResponse> {
    const request = RocketWorkbookExportRequestSchema.parse(input.request);
    const requestHash = workbookRequestHash({ ...input, request });
    return this.prisma.$transaction(async (tx) => {
      await lockWorkflow(tx, input.organizationId);
      await assertActiveActor(tx, input.organizationId, input.userId);

      const existing = await findExport(tx, input.organizationId, request.idempotencyKey);
      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new ConflictException(
            'Rocket workbook idempotency key was already used for a different decision.',
          );
        }
        return exportResponse(existing, true);
      }

      const active = await tx.rocketPurchaseConfirmation.findFirst({
        where: {
          organizationId: input.organizationId,
          status: { notIn: [...TERMINAL_STATUSES] },
        },
        include: exportInclude,
        orderBy: [{ confirmedAt: 'asc' }, { id: 'asc' }],
      });
      const refreshedActive = active
        ? await this.refreshWorkflow(tx, input.organizationId, active)
        : null;
      if (refreshedActive && !isTerminal(refreshedActive.status)) {
        throw new ConflictException(
          'A previous Rocket workbook workflow must complete before creating another workbook.',
        );
      }

      await assertSourceArtifact(tx, {
        organizationId: input.organizationId,
        channelAccountId: request.channelAccountId,
        sourceImportRunId: input.sourceImportRunId,
      });
      const decisions = buildDecisions(request, input.preview.rows);
      await assertCurrentRecipes(
        tx,
        input.organizationId,
        request.channelAccountId,
        decisions,
      );
      const hasPositiveQuantity = decisions.some(
        ({ workbookQuantity }) => workbookQuantity > 0,
      );
      if (hasPositiveQuantity && input.preview.inventoryGeneration === null) {
        throw new ConflictException(
          'A collected Sellpia inventory generation is required for a positive workbook.',
        );
      }
      await assertInventoryGeneration(
        tx,
        input.organizationId,
        input.preview.inventoryGeneration,
      );

      const artifactSha256 = createHash('sha256')
        .update(input.artifactBytes)
        .digest('hex');
      const now = new Date();
      const created = await tx.rocketPurchaseConfirmation.create({
        data: {
          idempotencyKey: request.idempotencyKey,
          requestHash,
          freshnessGeneration: input.preview.inventoryGeneration === null
            ? null
            : BigInt(input.preview.inventoryGeneration),
          status: hasPositiveQuantity ? 'awaiting_coupang_confirmation' : 'completed',
          artifactFileName: request.artifactFileName,
          artifactContentType: request.artifactContentType,
          artifactSha256,
          artifactBytes: Uint8Array.from(input.artifactBytes),
          artifactStoredAt: now,
          completedAt: hasPositiveQuantity ? null : now,
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
              barcode: decision.barcode,
              productName: decision.source.productName,
              orderQuantity: decision.source.orderQuantity,
              confirmedQuantity: decision.workbookQuantity,
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
        include: exportInclude,
      });
      return exportResponse(created, false);
    }, TRANSACTION_OPTIONS);
  }

  async getActiveWorkflow(
    input: Parameters<RocketWorkbookExportTransactionPort['getActiveWorkflow']>[0],
  ): Promise<RocketWorkbookExportResponse | null> {
    return this.prisma.$transaction(async (tx) => {
      await lockWorkflow(tx, input.organizationId);
      const record = await tx.rocketPurchaseConfirmation.findFirst({
        where: {
          organizationId: input.organizationId,
          status: { notIn: [...TERMINAL_STATUSES] },
        },
        include: exportInclude,
        orderBy: [{ confirmedAt: 'asc' }, { id: 'asc' }],
      });
      if (!record) return null;
      const refreshed = await this.refreshWorkflow(tx, input.organizationId, record);
      return isTerminal(refreshed.status) ? null : exportResponse(refreshed, false);
    }, TRANSACTION_OPTIONS);
  }

  async downloadWorkbook(
    input: Parameters<RocketWorkbookExportTransactionPort['downloadWorkbook']>[0],
  ): Promise<{ fileName: string; contentType: string; bytes: Buffer }> {
    const record = await this.prisma.rocketPurchaseConfirmation.findFirst({
      where: { id: input.exportId, organizationId: input.organizationId },
      select: {
        artifactFileName: true,
        artifactContentType: true,
        artifactBytes: true,
      },
    });
    if (
      !record?.artifactFileName
      || !record.artifactContentType
      || !record.artifactBytes
    ) {
      throw new NotFoundException('Rocket workbook artifact not found.');
    }
    return {
      fileName: record.artifactFileName,
      contentType: record.artifactContentType,
      bytes: Buffer.from(record.artifactBytes),
    };
  }

  async abandonWorkbook(
    input: Parameters<RocketWorkbookExportTransactionPort['abandonWorkbook']>[0],
  ): Promise<RocketWorkbookExportResponse> {
    return this.prisma.$transaction(async (tx) => {
      await lockWorkflow(tx, input.organizationId);
      await assertActiveActor(tx, input.organizationId, input.userId);
      const existing = await tx.rocketPurchaseConfirmation.findFirst({
        where: { id: input.exportId, organizationId: input.organizationId },
        include: exportInclude,
      });
      if (!existing) throw new NotFoundException('Rocket workbook export not found.');
      if (TERMINAL_STATUSES.includes(existing.status as (typeof TERMINAL_STATUSES)[number])) {
        return exportResponse(existing, true);
      }
      if (!canAbandon(existing)) {
        throw new ConflictException(
          'Fresh SHIPMENT and MILKRUN collection probes must prove that no matching Coupang order exists.',
        );
      }
      const completed = await tx.rocketPurchaseConfirmation.update({
        where: { id: existing.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
          releasedBy: input.userId,
          releasedAt: new Date(),
          releaseReason: input.reason,
        },
        include: exportInclude,
      });
      return exportResponse(completed, false);
    }, TRANSACTION_OPTIONS);
  }

  private async refreshWorkflow(
    tx: Prisma.TransactionClient,
    organizationId: string,
    record: ExportRecord,
  ): Promise<ExportRecord> {
    if (isTerminal(record.status)) return record;
    const positiveLines = record.lines.filter(
      ({ confirmedQuantity }) => confirmedQuantity > 0,
    );
    const projected = await this.progress.read({
      transaction: tx,
      organizationId,
      exportGeneration: record.freshnessGeneration,
      allPositiveLinesCollected: positiveLines.every(
        ({ collectedAt }) => collectedAt !== null,
      ),
      intentKeys: record.transmissions.flatMap(
        ({ intentKey }) => intentKey ? [intentKey] : [],
      ),
    });
    if (projected.status === publicStatus(record.status)) return record;
    return tx.rocketPurchaseConfirmation.update({
      where: { id: record.id },
      data: {
        status: projected.status,
        completedAt: projected.status === 'completed' ? new Date() : null,
        failureCode: projected.status === 'failed'
          ? 'SELLPIA_TRANSMISSION_RETRY_REQUIRED'
          : null,
        failureMessage: projected.status === 'failed'
          ? 'The linked Sellpia transmission must be retried or reconciled.'
          : null,
      },
      include: exportInclude,
    });
  }
}

const exportInclude = {
  lines: { include: { allocations: true } },
  transmissions: true,
} as const;

async function lockWorkflow(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<void> {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(
      hashtext(${LOCK_NAMESPACE}),
      hashtext(${organizationId})
    )
  `;
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
  const state = await tx.sellpiaInventoryState.findUnique({
    where: { organizationId },
    select: { verifiedGeneration: true },
  });
  if (!state || state.verifiedGeneration !== BigInt(generation)) {
    throw new ConflictException(
      'Sellpia inventory generation changed before Rocket workbook export.',
    );
  }
}

function buildDecisions(
  request: ReturnType<typeof RocketWorkbookExportRequestSchema.parse>,
  previewRows: RocketPurchasePreviewRow[],
): WorkbookDecision[] {
  const previewByLineId = new Map(previewRows.map((row) => [row.poLineId, row]));
  if (previewByLineId.size !== request.rows.length) {
    throw new ConflictException('Rocket preview rows changed before workbook export.');
  }
  return request.rows.map((requestRow) => {
    const source = previewByLineId.get(requestRow.poLineId);
    const workbookQuantity = request.editedQuantities[requestRow.poLineId]!;
    if (!source || source.editedQuantity !== workbookQuantity) {
      throw new ConflictException(
        'Rocket preview quantity changed before workbook export.',
      );
    }
    if (
      !source.channelSkuId
      || !source.productVariantId
      || source.components.length === 0
      || source.components.some((component) => !component.isActive)
    ) {
      throw new ConflictException(
        'Every Rocket workbook line requires a current confirmed recipe.',
      );
    }
    return {
      source,
      barcode: requestRow.barcode.trim() || null,
      workbookQuantity,
      shortageReason: request.shortageReasons[requestRow.poLineId] ?? null,
      allocations: source.components.map((component) => ({
        sellpiaInventorySkuId: component.sellpiaInventorySkuId,
        unitsPerVariant: component.quantity,
        quantity: workbookQuantity * component.quantity,
      })).filter(({ quantity }) => quantity > 0),
    };
  });
}

async function assertCurrentRecipes(
  tx: Prisma.TransactionClient,
  organizationId: string,
  channelAccountId: string,
  decisions: WorkbookDecision[],
): Promise<void> {
  const variantIds = [...new Set(decisions.flatMap(({ source }) =>
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
  for (const decision of decisions) {
    const variant = byId.get(decision.source.productVariantId!);
    const expected = decision.source.components
      .map(({ sellpiaInventorySkuId, quantity }) => ({
        sellpiaInventorySkuId,
        quantity,
      }))
      .sort((left, right) =>
        left.sellpiaInventorySkuId.localeCompare(right.sellpiaInventorySkuId));
    if (
      !variant
      || !variant.channelListingOptions.some(
        ({ id }) => id === decision.source.channelSkuId,
      )
      || JSON.stringify(variant.components) !== JSON.stringify(expected)
    ) {
      throw new ConflictException(
        'ProductVariant recipe changed after Rocket preview.',
      );
    }
  }
}

function findExport(
  tx: Prisma.TransactionClient,
  organizationId: string,
  idempotencyKey: string,
): Promise<ExportRecord | null> {
  return tx.rocketPurchaseConfirmation.findUnique({
    where: { organizationId_idempotencyKey: { organizationId, idempotencyKey } },
    include: exportInclude,
  });
}

function exportResponse(
  record: ExportRecord,
  duplicate: boolean,
): RocketWorkbookExportResponse {
  if (
    !record.artifactFileName
    || !record.artifactContentType
    || !record.artifactSha256
    || !record.artifactBytes
  ) {
    throw new ConflictException('Rocket workbook artifact is incomplete.');
  }
  const lines = [...record.lines].sort((left, right) =>
    left.poLineId.localeCompare(right.poLineId));
  return {
    exportId: record.id,
    status: publicStatus(record.status),
    duplicate,
    canAbandon: canAbandon(record),
    inventoryGeneration: record.freshnessGeneration?.toString() ?? null,
    generatedAt: record.confirmedAt.toISOString(),
    artifact: {
      fileName: record.artifactFileName,
      contentType: record.artifactContentType as RocketWorkbookExportResponse['artifact']['contentType'],
      sha256: record.artifactSha256,
      byteLength: record.artifactBytes.byteLength,
    },
    totals: {
      lineCount: lines.length,
      orderQuantity: sumLines(lines, 'orderQuantity'),
      workbookQuantity: sumLines(lines, 'confirmedQuantity'),
      componentQuantity: lines.reduce((sum, line) => sum
        + line.allocations.reduce(
          (lineSum, allocation) => lineSum + allocation.quantity,
          0,
        ), 0),
    },
    rows: lines.map((line) => ({
      poLineId: line.poLineId,
      workbookQuantity: line.confirmedQuantity,
      shortageReason: line.shortageReason as RocketWorkbookExportResponse['rows'][number]['shortageReason'],
    })),
  };
}

function publicStatus(status: string): RocketWorkbookWorkflowStatus {
  if (status === 'active') return 'awaiting_coupang_confirmation';
  if (status === 'released') return 'completed';
  if (
    status === 'awaiting_coupang_confirmation'
    || status === 'orders_collected'
    || status === 'sellpia_transmitting'
    || status === 'awaiting_inventory_sync'
    || status === 'completed'
    || status === 'failed'
  ) {
    return status;
  }
  return 'failed';
}

function isTerminal(status: string): boolean {
  return TERMINAL_STATUSES.includes(status as (typeof TERMINAL_STATUSES)[number]);
}

function canAbandon(record: ExportRecord): boolean {
  if (publicStatus(record.status) !== 'awaiting_coupang_confirmation') return false;
  if (record.lines.some(
    (line) => line.confirmedQuantity > 0 && line.collectedAt !== null,
  )) return false;
  const probes = new Map(record.transmissions.map((probe) => [probe.transport, probe]));
  return ['SHIPMENT', 'MILKRUN'].every((transport) => {
    const probe = probes.get(transport);
    return Boolean(
      probe
      && probe.matchedLineCount === 0
      && probe.observedAt >= record.confirmedAt,
    );
  });
}

function sumLines(
  lines: RocketPurchaseConfirmationLine[],
  field: 'orderQuantity' | 'confirmedQuantity',
): number {
  return lines.reduce((sum, line) => sum + line[field], 0);
}

function workbookRequestHash(
  input: Parameters<RocketWorkbookExportTransactionPort['exportWorkbook']>[0],
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
      workbookQuantity: input.request.editedQuantities[row.poLineId],
      shortageReason: input.request.shortageReasons[row.poLineId] ?? null,
      channelSkuId: preview?.channelSkuId ?? null,
      productVariantId: preview?.productVariantId ?? null,
      components: [...(preview?.components ?? [])]
        .map(({ sellpiaInventorySkuId, quantity }) => ({
          sellpiaInventorySkuId,
          quantity,
        }))
        .sort((left, right) =>
          left.sellpiaInventorySkuId.localeCompare(right.sellpiaInventorySkuId)),
    };
  }).sort((left, right) => left.poLineId.localeCompare(right.poLineId));
  return createHash('sha256').update(JSON.stringify({
    channelAccountId: input.request.channelAccountId,
    sourceImportRunId: input.sourceImportRunId,
    inventoryGeneration: input.preview.inventoryGeneration,
    artifactFileName: input.request.artifactFileName,
    artifactContentType: input.request.artifactContentType,
    rows: canonical,
  })).digest('hex');
}
