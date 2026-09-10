import { Inject, Injectable, Logger } from '@nestjs/common';
import { ProductAbcReadModelSchema } from '@kiditem/shared/product-abc';
import {
  CATALOG_DISPLAY_MEDIA_PORT,
  type CatalogDisplayMediaPort,
  type CatalogDisplayMediaTarget,
} from '../../ai/application/port/in/workspace/catalog-display-media.port';
import {
  INVENTORY_AVAILABILITY_PORT,
  type InventoryAvailabilityPort,
} from '../../inventory/application/port/in/stock/inventory-availability.port';
import { PrismaService } from '../../prisma/prisma.service';
import { MASTER_PRODUCT_PROFITABILITY_READ_PORT, type ProfitabilityEvidence, type ProfitabilityEvidenceSnapshot } from '../../finance/application/port/in/master-product-profitability-read.port';
import { productAbcEvaluation } from '../../products/mapper/product-abc-evaluation.mapper';
import { productAbcDisplayStatus } from '../../products/domain/product-abc-display-status';
import {
  projectSellpiaProductInventory,
  resolveSellpiaProductInventoryRows,
  type SellpiaProductInventoryProjectionInput,
} from './sellpia-product-inventory-projection';

@Injectable()
export class SellpiaProductInventoryReader {
  private readonly logger = new Logger(SellpiaProductInventoryReader.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(INVENTORY_AVAILABILITY_PORT)
    private readonly inventory: InventoryAvailabilityPort,
    @Inject(CATALOG_DISPLAY_MEDIA_PORT)
    private readonly catalogDisplayMedia: CatalogDisplayMediaPort,
    @Inject(MASTER_PRODUCT_PROFITABILITY_READ_PORT)
    private readonly evidence: ProfitabilityEvidence,
  ) {}

  async project(
    organizationId: string,
    products: readonly SellpiaProductInventoryProjectionInput[],
  ) {
    const candidates = await this.prisma.sellpiaInventorySku.findMany({
      where: { organizationId },
      select: {
        id: true,
        code: true,
        barcode: true,
        isActive: true,
        masterProduct: {
          select: {
            id: true,
            code: true,
            name: true,
            createdAt: true,
            abcEvaluation: { include: { formulaVersion: true } },
          },
        },
      },
    });
    const kst = new Date(Date.now() + 9 * 60 * 60 * 1_000);
    const targetCutoff = new Date(Date.UTC(
      kst.getUTCFullYear(),
      kst.getUTCMonth(),
      kst.getUTCDate() - 1,
    )).toISOString().slice(0, 10);
    const [evidence, state] = await Promise.all([
      this.evidence.load({ organizationId, targetCutoff }),
      this.prisma.masterProductAbcFormulaState.findUnique({ where: { organizationId } }),
    ]);
    const currentById = new Map(evidence.products.map((product) => [product.masterProductId, product]));
    const resolved = resolveSellpiaProductInventoryRows(products, candidates);
    const canonicalProductBySkuId = new Map(candidates.flatMap((candidate) => {
      const product = candidate.masterProduct;
      if (!product) return [];
      const evaluation = productAbcEvaluation(product.abcEvaluation);
      const abcGrade = evaluation?.abcGrade ?? null;
      const mappingValid = currentById.get(product.id)?.mappingValid ?? false;
      const abc = ProductAbcReadModelSchema.parse({
        abcGrade,
        evaluation,
        displayStatus: productAbcDisplayStatus(evaluation !== null, mappingValid, {
          ...evidence.sources, actualCutoff: evidence.actualCutoff,
        }, currentById.get(product.id)?.saleStartDate ?? null),
        formulaRevision: state?.formulaRevision ?? 0,
        publicationRevision: state?.publicationRevision ?? 0,
        officialCutoffDate: evaluation?.gradeBasisCutoffDate ?? state?.officialCutoffDate?.toISOString().slice(0, 10) ?? null,
        publishedAt: state?.publishedAt ?? null,
        actualCutoffDate: evidence.actualCutoff,
        sources: {
          sellpia: sourceView(evidence, 'sellpia'),
          advertising: sourceView(evidence, 'advertising'),
          mapping: {
            status: !mappingValid ? 'UNMAPPED' : evidence.mappingGeneration === null ? 'STALE' : 'READY',
            mappingGeneration: evidence.mappingGeneration,
          },
        },
      });
      return [[candidate.id, {
        sellpiaInventorySkuId: candidate.id,
        masterProductId: product.id,
        masterProductCode: product.code,
        masterProductName: product.name,
        abc,
      }] as const];
    }));
    const availability = await this.inventory.findBySkuIds({
      organizationId,
      sellpiaInventorySkuIds: resolved.matchedSkuIds,
    });
    const destinationRows = resolved.matchedSkuIds.length > 0
      ? await this.prisma.channelListingOptionInventoryComponent.findMany({
        where: {
          organizationId,
          sellpiaInventorySkuId: { in: resolved.matchedSkuIds },
          channelListingOption: {
            organizationId,
            isActive: true,
            listing: {
              organizationId,
              isActive: true,
              channelAccount: { organizationId, status: 'active' },
            },
          },
        },
        select: {
          sellpiaInventorySkuId: true,
          quantity: true,
          channelListingOption: {
            select: {
              id: true,
              externalOptionId: true,
              itemName: true,
              listing: {
                select: {
                  id: true,
                  externalId: true,
                  channelAccount: { select: { channel: true, isPrimary: true } },
                },
              },
            },
          },
        },
      })
      : [];
    const mediaRequests = uniqueMediaRequests(organizationId, destinationRows);
    let mediaByOptionId = new Map<string, Awaited<ReturnType<
      CatalogDisplayMediaPort['findDisplayMedia']
    >> extends Map<string, infer Media> ? Media : never>();
    if (mediaRequests.length > 0) {
      try {
        mediaByOptionId = await this.catalogDisplayMedia.findDisplayMedia({
          organizationId,
          requests: mediaRequests,
        });
      } catch (error) {
        this.logger.warn(
          `Catalog display media enrichment failed for organization ${organizationId} (${mediaRequests.length} targets).`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
    const projection = projectSellpiaProductInventory({
      products,
      resolutions: resolved.resolutions,
      availability,
      inventoryProducts: [...canonicalProductBySkuId.values()],
      destinations: destinationRows.flatMap((row) => {
        const product = canonicalProductBySkuId.get(row.sellpiaInventorySkuId);
        if (!product) return [];
        return [{
        sellpiaInventorySkuId: row.sellpiaInventorySkuId,
        unitsPerSale: row.quantity,
        masterProductId: product.masterProductId,
        masterProductCode: product.masterProductCode,
        masterProductName: product.masterProductName,
        channelListingOptionId: row.channelListingOption.id,
        channelListingId: row.channelListingOption.listing.id,
        channel: row.channelListingOption.listing.channelAccount.channel,
        externalOptionId: row.channelListingOption.externalOptionId,
        optionName: row.channelListingOption.itemName,
        abc: product.abc,
        displayImage: mediaByOptionId.get(row.channelListingOption.id) ?? null,
      }];
      }),
    });
    return { availability, projection };
  }
}

function sourceView(evidence: ProfitabilityEvidenceSnapshot, source: 'sellpia' | 'advertising') {
  const status = evidence.sources[source];
  const manifest = evidence.sourceVector[source];
  return {
    status: status.status,
    sourceImportRunId: manifest.sourceImportRunId,
    generation: manifest.publicationSequence,
    coverageStartDate: manifest.coverageStartDate,
    coverageEndDate: manifest.coverageEndDate,
    actualCutoffDate: status.actualCutoff,
    capturedAt: manifest.capturedAt,
    latestAttemptState: status.latestAttemptState,
    errorCode: status.errorCode,
  };
}

type DestinationOptionTarget = CatalogDisplayMediaTarget & {
  isOrigin: boolean;
  isPrimaryAccount: boolean;
  listingExternalId: string;
};

export function compareOptionTargets(
  left: DestinationOptionTarget,
  right: DestinationOptionTarget,
): number {
  return Number(right.isOrigin) - Number(left.isOrigin)
    || Number(right.isPrimaryAccount) - Number(left.isPrimaryAccount)
    || left.listingExternalId.localeCompare(right.listingExternalId)
    || left.channelListingId.localeCompare(right.channelListingId)
    || left.externalOptionId!.localeCompare(right.externalOptionId!);
}

function uniqueMediaRequests(
  _organizationId: string,
  rows: readonly {
    channelListingOption: {
      id: string;
      externalOptionId: string;
      listing: {
        id: string;
        externalId: string;
        channelAccount: { isPrimary: boolean };
      };
    };
  }[],
) {
  const byOptionId = new Map<string, DestinationOptionTarget>();
  for (const row of rows) {
    const option = row.channelListingOption;
    if (!byOptionId.has(option.id)) {
      byOptionId.set(option.id, {
        channelListingId: option.listing.id,
        externalOptionId: option.externalOptionId,
        isOrigin: false,
        isPrimaryAccount: option.listing.channelAccount.isPrimary,
        listingExternalId: option.listing.externalId,
      });
    }
  }
  return [...byOptionId.entries()].map(([key, candidate]) => ({
    key,
    candidates: [{
      channelListingId: candidate.channelListingId,
      externalOptionId: candidate.externalOptionId,
    }],
  }));
}
