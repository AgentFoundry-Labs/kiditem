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
  RocketWorkbookDecisionRequestSchema,
  type RocketWorkbookExportResponse,
  type RocketPurchasePreviewRow,
} from '@kiditem/shared/rocket-purchase-preview';
import { SOURCE_IMPORT_RUN_COMPLETED_STATUS } from '@kiditem/shared/source-import';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ownerTransaction } from '../../../../prisma/owner-transaction';
import {
  ROCKET_WORKBOOK_PROGRESS_PORT,
  type RocketWorkbookProgressPort,
  type RocketWorkbookWorkflowStatus,
} from '../../../../inventory/application/port/in/stock/rocket-workbook-progress.port';
import type { RocketWorkbookExportTransactionPort } from '../../../application/port/out/transaction/rocket-purchase-confirmation.transaction.port';
import {
  PRODUCT_TRANSACTIONAL_READ_PORT,
  type ProductTransactionalReadPort,
} from '../../../../products/application/port/in/product-transactional-read.port';
import {
  CHANNEL_OPTION_RECIPE_PORT,
  type ChannelOptionRecipePort,
} from '../../../../channels/application/port/in/channel-option-recipe.port';

const LOCK_NAMESPACE = 'rocket-workbook-workflow';
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;
const exportSelect = {
  id: true,
  organizationId: true,
  channelAccountId: true,
  sourceImportRunId: true,
  idempotencyKey: true,
  requestHash: true,
  freshnessGeneration: true,
  confirmedAt: true,
  artifactFileName: true,
  artifactContentType: true,
  artifactSha256: true,
  artifactBytes: true,
  completedAt: true,
  releasedAt: true,
  lines: { include: { allocations: true } },
  transmissions: true,
} as const satisfies Prisma.RocketPurchaseConfirmationSelect;

type ExportRecord = Prisma.RocketPurchaseConfirmationGetPayload<{
  select: typeof exportSelect;
}>;
type RefreshedWorkflow = {
  record: ExportRecord;
  status: RocketWorkbookWorkflowStatus;
};

type WorkbookDecision = {
  source: RocketPurchasePreviewRow;
  barcode: string | null;
  workbookQuantity: number;
  shortageReason: string | null;
  allocations: Array<{
    masterProductId: string;
    unitsPerSale: number;
    quantity: number;
  }>;
};

@Injectable()
export class RocketPurchaseConfirmationTransactionAdapter implements RocketWorkbookExportTransactionPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ROCKET_WORKBOOK_PROGRESS_PORT)
    private readonly progress: RocketWorkbookProgressPort,
    @Inject(PRODUCT_TRANSACTIONAL_READ_PORT)
    private readonly products: ProductTransactionalReadPort,
    @Inject(CHANNEL_OPTION_RECIPE_PORT)
    private readonly channelRecipes: ChannelOptionRecipePort,
  ) {}

  async exportWorkbook(
    input: Parameters<RocketWorkbookExportTransactionPort['exportWorkbook']>[0],
  ): Promise<RocketWorkbookExportResponse> {
    const request = RocketWorkbookDecisionRequestSchema.parse(input.request);
    const requestHash = workbookRequestHash({ ...input, request });
    return this.prisma.$transaction(async (tx) => {
      await lockWorkflow(tx, input.organizationId);
      await assertActiveActor(tx, input.organizationId, input.userId);

      const existing = await findExport(
        tx,
        input.organizationId,
        request.idempotencyKey,
      );
      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new ConflictException(
            'Rocket workbook idempotency key was already used for a different decision.',
          );
        }
        const refreshed = await this.refreshWorkflow(
          tx,
          input.organizationId,
          existing,
        );
        return exportResponse(refreshed.record, true);
      }

      const active = await tx.rocketPurchaseConfirmation.findFirst({
        where: {
          organizationId: input.organizationId,
          completedAt: null,
          releasedAt: null,
        },
        select: exportSelect,
        orderBy: [{ confirmedAt: 'asc' }, { id: 'asc' }],
      });
      const refreshedActive = active
        ? await this.refreshWorkflow(tx, input.organizationId, active)
        : null;
      if (refreshedActive && refreshedActive.status !== 'completed') {
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
        this.channelRecipes,
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
        decisions,
        this.products,
      );

      const artifactSha256 = createHash('sha256')
        .update(input.artifactBytes)
        .digest('hex');
      const now = new Date();
      const created = await tx.rocketPurchaseConfirmation.create({
        data: {
          idempotencyKey: request.idempotencyKey,
          requestHash,
          freshnessGeneration:
            input.preview.inventoryGeneration === null
              ? null
              : BigInt(input.preview.inventoryGeneration),
          artifactFileName: request.artifactFileName,
          artifactContentType: request.artifactContentType,
          artifactSha256,
          artifactBytes: Uint8Array.from(input.artifactBytes),
          completedAt: hasPositiveQuantity ? null : now,
          channelAccountId: request.channelAccountId,
          organization: { connect: { id: input.organizationId } },
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
              channelListingOptionId: decision.source.channelListingOptionId,
              organization: { connect: { id: input.organizationId } },
              allocations: {
                create: decision.allocations.map((allocation) => ({
                  unitsPerSale: allocation.unitsPerSale,
                  quantity: allocation.quantity,
                  organization: { connect: { id: input.organizationId } },
                  masterProductId: allocation.masterProductId,
                })),
              },
            })),
          },
        },
        select: exportSelect,
      });
      return exportResponse(created, false);
    }, TRANSACTION_OPTIONS);
  }

  async getActiveWorkflow(
    input: Parameters<
      RocketWorkbookExportTransactionPort['getActiveWorkflow']
    >[0],
  ): Promise<RocketWorkbookExportResponse | null> {
    return this.prisma.$transaction(async (tx) => {
      await lockWorkflow(tx, input.organizationId);
      const record = await tx.rocketPurchaseConfirmation.findFirst({
        where: {
          organizationId: input.organizationId,
          completedAt: null,
          releasedAt: null,
        },
        select: exportSelect,
        orderBy: [{ confirmedAt: 'asc' }, { id: 'asc' }],
      });
      if (!record) return null;
      const refreshed = await this.refreshWorkflow(
        tx,
        input.organizationId,
        record,
      );
      return refreshed.status === 'completed'
        ? null
        : exportResponse(refreshed.record, false);
    }, TRANSACTION_OPTIONS);
  }

  async downloadWorkbook(
    input: Parameters<
      RocketWorkbookExportTransactionPort['downloadWorkbook']
    >[0],
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
      !record?.artifactFileName ||
      !record.artifactContentType ||
      !record.artifactBytes
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
    input: Parameters<
      RocketWorkbookExportTransactionPort['abandonWorkbook']
    >[0],
  ): Promise<RocketWorkbookExportResponse> {
    return this.prisma.$transaction(async (tx) => {
      await lockWorkflow(tx, input.organizationId);
      await assertActiveActor(tx, input.organizationId, input.userId);
      const existing = await tx.rocketPurchaseConfirmation.findFirst({
        where: { id: input.exportId, organizationId: input.organizationId },
        select: exportSelect,
      });
      if (!existing)
        throw new NotFoundException('Rocket workbook export not found.');
      const refreshed = await this.refreshWorkflow(
        tx,
        input.organizationId,
        existing,
      );
      if (refreshed.status === 'completed') {
        return exportResponse(refreshed.record, true);
      }
      if (!canAbandon(refreshed.record, refreshed.status)) {
        throw new ConflictException(
          'Fresh SHIPMENT and MILKRUN collection probes must prove that no matching Coupang order exists.',
        );
      }
      const completed = await tx.rocketPurchaseConfirmation.update({
        where: { id: existing.id },
        data: {
          completedAt: new Date(),
          releasedAt: new Date(),
        },
        select: exportSelect,
      });
      return exportResponse(completed, false);
    }, TRANSACTION_OPTIONS);
  }

  // 이미 확정 엑셀로 나간 PO 라인만 되돌려준다. 취소(released)된 워크북은 제출로 보지
  // 않으므로 제외한다 — 그 라인은 다시 내보낼 수 있어야 한다.
  async listExportedPoLineIds(
    input: Parameters<
      RocketWorkbookExportTransactionPort['listExportedPoLineIds']
    >[0],
  ): Promise<string[]> {
    if (input.poLineIds.length === 0) return [];
    const lines = await this.prisma.rocketPurchaseConfirmationLine.findMany({
      where: {
        organizationId: input.organizationId,
        poLineId: { in: input.poLineIds },
        confirmation: {
          organizationId: input.organizationId,
          channelAccountId: input.channelAccountId,
          releasedAt: null,
        },
      },
      select: { poLineId: true },
      distinct: ['poLineId'],
    });
    return lines.map(({ poLineId }) => poLineId);
  }

  private async refreshWorkflow(
    tx: Prisma.TransactionClient,
    organizationId: string,
    record: ExportRecord,
  ): Promise<RefreshedWorkflow> {
    if (record.completedAt || record.releasedAt) {
      return { record, status: 'completed' };
    }
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
      intentKeys: record.transmissions.flatMap(({ intentKey }) =>
        intentKey ? [intentKey] : [],
      ),
    });
    // Every open state, a failed transmission included, is derived again from
    // the lines and the Orders-owned intents on each read. Only completion is
    // persisted.
    if (projected.status !== 'completed') {
      return { record, status: projected.status };
    }
    const updated = await tx.rocketPurchaseConfirmation.update({
      where: { id: record.id },
      data: { completedAt: new Date() },
      select: exportSelect,
    });
    return { record: updated, status: projected.status };
  }
}

async function lockWorkflow(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<void> {
  await tx.$executeRaw`
    -- queryraw-tenancy-exempt: organization-scoped advisory lock; reads no tenant data.
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
    throw new UnauthorizedException(
      'Active organization membership is required.',
    );
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
      status: SOURCE_IMPORT_RUN_COMPLETED_STATUS,
      parserVersion: 'rocket-po-v1',
    },
    select: { id: true },
  });
  if (!run) {
    throw new BadRequestException(
      'Completed Rocket PO source artifact not found.',
    );
  }
}

async function assertInventoryGeneration(
  tx: Prisma.TransactionClient,
  organizationId: string,
  generation: string | null,
  decisions: WorkbookDecision[],
  products: ProductTransactionalReadPort,
): Promise<void> {
  if (generation === null) return;
  const masterProductIds = [
    ...new Set(
      decisions.flatMap(({ source }) =>
        source.components.map(
          ({ masterProductId }) => masterProductId,
        ),
      ),
    ),
  ];
  const productLock = await products.lock({ client: tx }, organizationId);
  const current = await products.readAvailability({ client: tx }, productLock, {
    organizationId,
    masterProductIds,
  });
  if (
    !current.snapshot.collected ||
    current.snapshot.generation !== generation ||
    current.items.length !== masterProductIds.length
  ) {
    throw new ConflictException(
      'Sellpia inventory generation changed before Rocket workbook export.',
    );
  }
}

function buildDecisions(
  request: ReturnType<typeof RocketWorkbookDecisionRequestSchema.parse>,
  previewRows: RocketPurchasePreviewRow[],
): WorkbookDecision[] {
  const previewByLineId = new Map(
    previewRows.map((row) => [row.poLineId, row]),
  );
  if (previewByLineId.size !== request.rows.length) {
    throw new ConflictException(
      'Rocket preview rows changed before workbook export.',
    );
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
      !source.channelListingOptionId ||
      source.components.length === 0 ||
      source.components.some((component) => component.currentStock === null)
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
      allocations: source.components
        .map((component) => ({
          masterProductId: component.masterProductId,
          unitsPerSale: component.quantity,
          quantity: workbookQuantity * component.quantity,
        }))
        .filter(({ quantity }) => quantity > 0),
    };
  });
}

async function assertCurrentRecipes(
  tx: Prisma.TransactionClient,
  channelRecipes: ChannelOptionRecipePort,
  organizationId: string,
  channelAccountId: string,
  decisions: WorkbookDecision[],
): Promise<void> {
  const optionIds = [
    ...new Set(
      decisions.flatMap(({ source }) =>
        source.channelListingOptionId ? [source.channelListingOptionId] : [],
      ),
    ),
  ];
  if (optionIds.length === 0) return;
  const options = await channelRecipes.readConfirmedCompositions(ownerTransaction(tx), {
    organizationId,
    accountIds: [channelAccountId],
    optionIds,
    activeOnly: true,
  });
  const byId = new Map(options.map((option) => [option.optionId, option]));
  for (const decision of decisions) {
    const option = byId.get(decision.source.channelListingOptionId!);
    const expected = decision.source.components
      .map(({ masterProductId, quantity }) => ({
        masterProductId,
        quantity,
      }))
      .sort((left, right) =>
        left.masterProductId.localeCompare(right.masterProductId),
      );
    if (
      !option ||
      JSON.stringify(option.components) !== JSON.stringify(expected)
    ) {
      throw new ConflictException(
        'Channel option inventory recipe changed after Rocket preview.',
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
    where: {
      organizationId_idempotencyKey: { organizationId, idempotencyKey },
    },
    select: exportSelect,
  });
}

function exportResponse(
  record: ExportRecord,
  duplicate: boolean,
): RocketWorkbookExportResponse {
  if (
    !record.artifactFileName ||
    !record.artifactContentType ||
    !record.artifactSha256 ||
    !record.artifactBytes
  ) {
    throw new ConflictException('Rocket workbook artifact is incomplete.');
  }
  const lines = [...record.lines].sort((left, right) =>
    left.poLineId.localeCompare(right.poLineId),
  );
  return {
    exportId: record.id,
    duplicate,
    inventoryGeneration: record.freshnessGeneration?.toString() ?? null,
    generatedAt: record.confirmedAt.toISOString(),
    artifact: {
      fileName: record.artifactFileName,
      contentType:
        record.artifactContentType as RocketWorkbookExportResponse['artifact']['contentType'],
      sha256: record.artifactSha256,
      byteLength: record.artifactBytes.byteLength,
    },
    totals: {
      lineCount: lines.length,
      orderQuantity: sumLines(lines, 'orderQuantity'),
      workbookQuantity: sumLines(lines, 'confirmedQuantity'),
      componentQuantity: lines.reduce(
        (sum, line) =>
          sum +
          line.allocations.reduce(
            (lineSum, allocation) => lineSum + allocation.quantity,
            0,
          ),
        0,
      ),
    },
    rows: lines.map((line) => ({
      poLineId: line.poLineId,
      workbookQuantity: line.confirmedQuantity,
      shortageReason:
        line.shortageReason as RocketWorkbookExportResponse['rows'][number]['shortageReason'],
    })),
  };
}

function canAbandon(
  record: ExportRecord,
  status: RocketWorkbookWorkflowStatus,
): boolean {
  if (status !== 'awaiting_coupang_confirmation') return false;
  // A probe links workbook lines only by collecting their Coupang order lines,
  // so the lines any probe linked are the positive lines collected so far.
  // Abandonment needs that linked count to be zero and both transports probed
  // after the export.
  if (
    record.lines.some(
      (line) => line.confirmedQuantity > 0 && line.collectedAt !== null,
    )
  )
    return false;
  const probes = new Map(
    record.transmissions.map((probe) => [probe.transport, probe]),
  );
  return ['SHIPMENT', 'MILKRUN'].every((transport) => {
    const probe = probes.get(transport);
    return Boolean(probe && probe.observedAt >= record.confirmedAt);
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
  const previewByLineId = new Map(
    input.preview.rows.map((row) => [row.poLineId, row]),
  );
  const canonical = input.request.rows
    .map((row) => {
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
        channelListingOptionId: preview?.channelListingOptionId ?? null,
        components: [...(preview?.components ?? [])]
          .map(({ masterProductId, quantity }) => ({
            masterProductId,
            quantity,
          }))
          .sort((left, right) =>
            left.masterProductId.localeCompare(
              right.masterProductId,
            ),
          ),
      };
    })
    .sort((left, right) => left.poLineId.localeCompare(right.poLineId));
  return createHash('sha256')
    .update(
      JSON.stringify({
        channelAccountId: input.request.channelAccountId,
        sourceImportRunId: input.sourceImportRunId,
        inventoryGeneration: input.preview.inventoryGeneration,
        artifactFileName: input.request.artifactFileName,
        artifactContentType: input.request.artifactContentType,
        rows: canonical,
      }),
    )
    .digest('hex');
}
