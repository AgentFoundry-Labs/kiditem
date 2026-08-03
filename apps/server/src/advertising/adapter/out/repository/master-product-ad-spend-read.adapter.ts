import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  MasterProductAdSpendEvidence,
  MasterProductAdSpendReadPort,
} from '../../../application/port/in/master-product-ad-spend-read.port';

@Injectable()
export class MasterProductAdSpendReadAdapter
  implements MasterProductAdSpendReadPort
{
  constructor(private readonly prisma: PrismaService) {}

  async readDailyAdSpend(input: {
    organizationId: string;
    requests: readonly {
      masterProductId: string;
      coverage: readonly { startDate: Date; endDate: Date }[];
    }[];
    asOfDate: Date;
  }): Promise<readonly MasterProductAdSpendEvidence[]> {
    const requests = uniqueRequests(input.requests);
    if (requests.length === 0) return [];
    const masterProductIds = requests.map((request) => request.masterProductId);
    const listings = await this.prisma.channelListing.findMany({
      where: {
        organizationId: input.organizationId,
        isActive: true,
        channelAccount: {
          is: {
            organizationId: input.organizationId,
            channel: 'coupang',
            status: 'active',
          },
        },
        options: {
          some: {
            isActive: true,
            inventoryComponents: {
              some: {
                sellpiaInventorySku: {
                  is: { masterProductId: { in: masterProductIds } },
                },
              },
            },
          },
        },
      },
      select: {
        id: true,
        options: {
          where: { isActive: true },
          select: {
            inventoryComponents: {
              select: {
                quantity: true,
                sellpiaInventorySku: { select: { masterProductId: true } },
              },
            },
          },
        },
      },
    });
    const recipeListings = listings.flatMap((listing) => {
      const recipe = completeListingRecipe(listing);
      return recipe ? [{ id: listing.id, masterWeights: recipe }] : [];
    });
    const listingIds = recipeListings.map((listing) => listing.id);
    const expectedDatesByMaster = new Map(requests.map((request) => [
      request.masterProductId,
      expectedCalendarDates(request.coverage),
    ]));
    const allExpectedDates = uniqueDates([...expectedDatesByMaster.values()].flat());
    const rows = listingIds.length === 0 || allExpectedDates.length === 0
      ? []
      : await this.prisma.channelListingDailySnapshot.findMany({
        where: {
          organizationId: input.organizationId,
          listingId: { in: listingIds },
          businessDate: { in: allExpectedDates },
          adCoverageStatus: { in: ['OBSERVED', 'CONFIRMED_ZERO'] },
          adObservedAt: { not: null },
        },
        select: {
          listingId: true,
          businessDate: true,
          adSpend: true,
          adCoverageStatus: true,
          adObservedAt: true,
        },
      });
    const listingsByMaster = new Map<string, ListingRecipe[]>();
    for (const listing of recipeListings) {
      for (const masterProductId of listing.masterWeights.keys()) {
        const recipes = listingsByMaster.get(masterProductId) ?? [];
        recipes.push(listing);
        listingsByMaster.set(masterProductId, recipes);
      }
    }
    const rowByListingAndDate = new Map(rows.map((row) => [
      `${row.listingId}\u0000${dateKey(row.businessDate)}`,
      row,
    ]));

    return requests.map((request) => {
      const expectedDates = expectedDatesByMaster.get(request.masterProductId) ?? [];
      const masterListings = listingsByMaster.get(request.masterProductId) ?? [];
      const expectedPairs = masterListings.flatMap((listing) => expectedDates.map((date) => ({
        listingId: listing.id,
        date,
      })));
      const foundRows = expectedPairs.flatMap(({ listingId, date }) => {
        const row = rowByListingAndDate.get(`${listingId}\u0000${dateKey(date)}`);
        return row ? [row] : [];
      });
      const cutoffMatches = expectedDates.length > 0
        && dateKey(expectedDates[expectedDates.length - 1]!) === dateKey(input.asOfDate);
      const coverageStartDate = expectedDates[0] ?? null;
      const coverageEndDate = expectedDates[expectedDates.length - 1] ?? null;
      if (masterListings.length === 0 || expectedDates.length === 0 || foundRows.length === 0) {
        return {
          masterProductId: request.masterProductId,
          status: 'MISSING',
          coverageStartDate,
          coverageEndDate,
          capturedAt: null,
          dailyFacts: [],
        } satisfies MasterProductAdSpendEvidence;
      }
      if (!cutoffMatches || foundRows.length !== expectedPairs.length) {
        return {
          masterProductId: request.masterProductId,
          status: 'STALE',
          coverageStartDate,
          coverageEndDate,
          capturedAt: latestCapturedAt(foundRows),
          dailyFacts: [],
        } satisfies MasterProductAdSpendEvidence;
      }
      const dailyFacts = expectedDates.map((businessDate) => ({
        businessDate,
        adSpend: masterListings.reduce((sum, listing) => {
          const spend = rowByListingAndDate.get(`${listing.id}\u0000${dateKey(businessDate)}`)?.adSpend ?? 0;
          return sum + allocatedAdSpend(spend, listing.masterWeights, request.masterProductId);
        }, 0),
      }));
      return {
        masterProductId: request.masterProductId,
        // A MasterProduct can receive a zero-won share after deterministic
        // rounding even when the source listing did spend. Preserve that
        // provenance as OBSERVED instead of falsely reporting a zero-spend
        // source.
        status: foundRows.every((row) => row.adSpend === 0) ? 'CONFIRMED_ZERO' : 'OBSERVED',
        coverageStartDate,
        coverageEndDate,
        capturedAt: latestCapturedAt(foundRows),
        dailyFacts,
      } satisfies MasterProductAdSpendEvidence;
    });
  }
}

type ListingRecipe = Readonly<{
  id: string;
  masterWeights: ReadonlyMap<string, number>;
}>;

/**
 * The ad source is listing-grain while ABC belongs to MasterProduct. A listing
 * may be a bundle or option family backed by multiple inventory products, so
 * allocate its spend by the confirmed option recipe. We only use a fully
 * mapped listing: charging a mapped MasterProduct for an unknown option would
 * make its profitability look worse without a defensible allocation basis.
 */
function completeListingRecipe(listing: {
  options: readonly {
    inventoryComponents: readonly {
      quantity: number;
      sellpiaInventorySku: { masterProductId: string | null };
    }[];
  }[];
}): ReadonlyMap<string, number> | null {
  if (listing.options.length === 0) return null;
  const masterWeights = new Map<string, number>();
  for (const option of listing.options) {
    if (option.inventoryComponents.length === 0) return null;
    for (const component of option.inventoryComponents) {
      const masterProductId = component.sellpiaInventorySku.masterProductId;
      if (!masterProductId || component.quantity <= 0) return null;
      masterWeights.set(
        masterProductId,
        (masterWeights.get(masterProductId) ?? 0) + component.quantity,
      );
    }
  }
  return masterWeights.size > 0 ? masterWeights : null;
}

/**
 * Keep the source amount conserved at a one-won resolution. Largest remainder
 * makes the unavoidable rounding deterministic instead of duplicating (or
 * losing) spend across the MasterProducts in a bundle.
 */
function allocatedAdSpend(
  totalSpend: number,
  masterWeights: ReadonlyMap<string, number>,
  targetMasterProductId: string,
): number {
  const totalWeight = [...masterWeights.values()].reduce((sum, weight) => sum + weight, 0);
  const targetWeight = masterWeights.get(targetMasterProductId) ?? 0;
  if (totalWeight <= 0 || targetWeight <= 0 || totalSpend === 0) return 0;

  const allocations = [...masterWeights.entries()].map(([masterProductId, weight]) => {
    const exact = totalSpend * weight / totalWeight;
    return {
      masterProductId,
      amount: Math.floor(exact),
      fraction: exact - Math.floor(exact),
    };
  });
  let remaining = totalSpend - allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
  allocations.sort((left, right) => right.fraction - left.fraction
    || left.masterProductId.localeCompare(right.masterProductId));
  for (let index = 0; remaining > 0; index = (index + 1) % allocations.length) {
    allocations[index]!.amount += 1;
    remaining -= 1;
  }
  return allocations.find((allocation) => allocation.masterProductId === targetMasterProductId)?.amount ?? 0;
}

function uniqueRequests(input: readonly {
  masterProductId: string;
  coverage: readonly { startDate: Date; endDate: Date }[];
}[]) {
  const byMasterProductId = new Map<string, { masterProductId: string; coverage: readonly { startDate: Date; endDate: Date }[] }>();
  for (const request of input) byMasterProductId.set(request.masterProductId, request);
  return [...byMasterProductId.values()];
}

function expectedCalendarDates(coverage: readonly { startDate: Date; endDate: Date }[]): Date[] {
  const dates: Date[] = [];
  for (const range of coverage) {
    const start = atUtcCalendarDay(range.startDate);
    const end = atUtcCalendarDay(range.endDate);
    if (start > end) throw new Error('Advertising coverage start must not be after its end');
    for (let date = start; date <= end; date = addUtcDays(date, 1)) dates.push(date);
  }
  return uniqueDates(dates);
}

function uniqueDates(dates: readonly Date[]): Date[] {
  return [...new Map(dates.map((date) => [dateKey(date), atUtcCalendarDay(date)])).values()]
    .sort((left, right) => left.getTime() - right.getTime());
}

function atUtcCalendarDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function latestCapturedAt(rows: readonly { adObservedAt: Date | null }[]): Date | null {
  return rows.reduce<Date | null>((latest, row) =>
    row.adObservedAt && (!latest || row.adObservedAt > latest)
      ? row.adObservedAt
      : latest, null);
}
