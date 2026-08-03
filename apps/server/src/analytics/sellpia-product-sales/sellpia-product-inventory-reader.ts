import { Inject, Injectable, Logger } from '@nestjs/common';
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
import {
  projectSellpiaProductInventory,
  resolveSellpiaProductInventoryRows,
  type SellpiaProductInventoryProjectionInput,
} from './sellpia-product-inventory-projection';
import {
  ProductAbcEvaluationSchema,
  ProductAbcFormulaSummarySchema,
  type ProductAbcEvaluation,
} from '@kiditem/shared/product-abc';

@Injectable()
export class SellpiaProductInventoryReader {
  private readonly logger = new Logger(SellpiaProductInventoryReader.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(INVENTORY_AVAILABILITY_PORT)
    private readonly inventory: InventoryAvailabilityPort,
    @Inject(CATALOG_DISPLAY_MEDIA_PORT)
    private readonly catalogDisplayMedia: CatalogDisplayMediaPort,
  ) {}

  async project(
    organizationId: string,
    products: readonly SellpiaProductInventoryProjectionInput[],
  ) {
    const candidates = await this.prisma.sellpiaInventorySku.findMany({
      where: { organizationId },
      select: { id: true, code: true, barcode: true, isActive: true },
    });
    const resolved = resolveSellpiaProductInventoryRows(products, candidates);
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
              masterProduct: { organizationId, isActive: true },
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
                  masterProduct: {
                    select: {
                      id: true,
                      code: true,
                      name: true,
                      abcGrade: true,
                      abcEvaluation: { include: { formulaVersion: true } },
                    },
                  },
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
      destinations: destinationRows.map((row) => ({
        sellpiaInventorySkuId: row.sellpiaInventorySkuId,
        unitsPerSale: row.quantity,
        masterProductId: row.channelListingOption.listing.masterProduct!.id,
        masterProductCode: row.channelListingOption.listing.masterProduct!.code,
        masterProductName: row.channelListingOption.listing.masterProduct!.name,
        channelListingOptionId: row.channelListingOption.id,
        channelListingId: row.channelListingOption.listing.id,
        channel: row.channelListingOption.listing.channelAccount.channel,
        externalOptionId: row.channelListingOption.externalOptionId,
        optionName: row.channelListingOption.itemName,
        abcGrade:
          row.channelListingOption.listing.masterProduct!.abcGrade === 'A'
          || row.channelListingOption.listing.masterProduct!.abcGrade === 'B'
          || row.channelListingOption.listing.masterProduct!.abcGrade === 'C'
            ? row.channelListingOption.listing.masterProduct!.abcGrade
            : null,
        abcEvaluation: toAbcEvaluation(
          row.channelListingOption.listing.masterProduct!.abcEvaluation,
          row.channelListingOption.listing.masterProduct!.abcGrade,
        ),
        displayImage: mediaByOptionId.get(row.channelListingOption.id) ?? null,
      })),
    });
    return { availability, projection };
  }
}

function toAbcEvaluation(
  row: {
    calculationStatus: string;
    rawScore: { toNumber(): number } | null;
    adjustedScore: { toNumber(): number } | null;
    reliability: { toNumber(): number } | null;
    weightedRevenue: { toNumber(): number } | null;
    weightedOrderTimeCogs: { toNumber(): number } | null;
    weightedAdSpend: { toNumber(): number } | null;
    weightedContributionProfit: { toNumber(): number } | null;
    profitVelocity30: { toNumber(): number } | null;
    weightedContributionMargin: { toNumber(): number } | null;
    lossRecurrence: { toNumber(): number } | null;
    paidOrderCount: number;
    observationDays: number;
    firstValidPaidSaleAt: Date | null;
    sourceCoverageStartDate: Date | null;
    sourceCoverageEndDate: Date | null;
    sellpiaCoverageStartDate: Date | null;
    sellpiaCoverageEndDate: Date | null;
    sellpiaSourceStatus: string;
    sellpiaSourceCapturedAt: Date | null;
    advertisingCoverageStartDate: Date | null;
    advertisingCoverageEndDate: Date | null;
    advertisingSourceStatus: string;
    advertisingSourceCapturedAt: Date | null;
    ordersSourceStatus: string;
    ordersCoverageStartDate: Date | null;
    ordersCoverageEndDate: Date | null;
    ordersSourceCapturedAt: Date | null;
    mappingSourceStatus: string;
    mappingInventoryGeneration: bigint | null;
    mappingVerifiedAt: Date | null;
    costComponentsJson: unknown;
    statusDetail: string | null;
    calculatedAt: Date | null;
    formulaVersion: { formulaJson: unknown } | null;
  } | null,
  abcGrade: string | null,
): ProductAbcEvaluation | null {
  if (!row || !row.costComponentsJson) return null;
  const cutoff = row.sourceCoverageEndDate ?? row.calculatedAt;
  if (!cutoff) return null;
  const formula = row.formulaVersion
    ? ProductAbcFormulaSummarySchema.safeParse(row.formulaVersion.formulaJson)
    : null;
  const parsed = ProductAbcEvaluationSchema.safeParse({
    abcGrade: productAbcGrade(abcGrade),
    calculationStatus: row.calculationStatus,
    rawScore: decimalToFinite(row.rawScore),
    adjustedScore: decimalToFinite(row.adjustedScore),
    reliability: decimalToFinite(row.reliability),
    weightedRevenue: decimalToFinite(row.weightedRevenue),
    weightedOrderTimeCogs: decimalToFinite(row.weightedOrderTimeCogs),
    weightedAdSpend: decimalToFinite(row.weightedAdSpend),
    weightedContributionProfit: decimalToFinite(row.weightedContributionProfit),
    profitVelocity30: decimalToFinite(row.profitVelocity30),
    weightedContributionMargin: decimalToFinite(row.weightedContributionMargin),
    lossRecurrence: decimalToFinite(row.lossRecurrence),
    paidOrderCount: row.paidOrderCount,
    observationDays: row.observationDays,
    firstValidPaidSaleAt: row.firstValidPaidSaleAt,
    formula: formula?.success ? formula.data : null,
    sourceFreshness: {
      evaluationCutoffDate: calendarDate(cutoff),
      sellpia: {
        status: row.sellpiaSourceStatus,
        coverageStartDate: row.sellpiaCoverageStartDate ?? row.sourceCoverageStartDate
          ? calendarDate((row.sellpiaCoverageStartDate ?? row.sourceCoverageStartDate)!)
          : null,
        coverageEndDate: row.sellpiaCoverageEndDate ?? row.sourceCoverageEndDate
          ? calendarDate((row.sellpiaCoverageEndDate ?? row.sourceCoverageEndDate)!)
          : null,
        capturedAt: row.sellpiaSourceCapturedAt,
      },
      advertising: {
        status: row.advertisingSourceStatus,
        coverageStartDate: row.advertisingCoverageStartDate
          ? calendarDate(row.advertisingCoverageStartDate)
          : null,
        coverageEndDate: row.advertisingCoverageEndDate
          ? calendarDate(row.advertisingCoverageEndDate)
          : null,
        capturedAt: row.advertisingSourceCapturedAt,
      },
      orders: {
        status: row.ordersSourceStatus,
        coverageStartDate: row.ordersCoverageStartDate
          ? calendarDate(row.ordersCoverageStartDate)
          : null,
        coverageEndDate: row.ordersCoverageEndDate
          ? calendarDate(row.ordersCoverageEndDate)
          : null,
        capturedAt: row.ordersSourceCapturedAt,
      },
      mapping: {
        status: row.mappingSourceStatus,
        inventoryGeneration: row.mappingInventoryGeneration?.toString() ?? null,
        verifiedAt: row.mappingVerifiedAt,
      },
    },
    costBreakdown: row.costComponentsJson,
    statusDetail: row.statusDetail,
    calculatedAt: row.calculatedAt,
  });
  return parsed.success ? parsed.data : null;
}

function productAbcGrade(value: string | null): 'A' | 'B' | 'C' | null {
  return value === 'A' || value === 'B' || value === 'C' ? value : null;
}

function decimalToFinite(value: { toNumber(): number } | null): number | null {
  if (value === null) return null;
  const number = value.toNumber();
  return Number.isFinite(number) ? number : null;
}

function calendarDate(value: Date): string {
  return value.toISOString().slice(0, 10);
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
