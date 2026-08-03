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
        masterProductId: { in: masterProductIds },
        isActive: true,
        channelAccount: {
          is: {
            organizationId: input.organizationId,
            channel: 'coupang',
            status: 'active',
          },
        },
      },
      select: { id: true, masterProductId: true },
    });
    const listingIds = listings.map((listing) => listing.id);
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
    const listingsByMaster = new Map<string, string[]>();
    for (const listing of listings) {
      if (!listing.masterProductId) continue;
      const ids = listingsByMaster.get(listing.masterProductId) ?? [];
      ids.push(listing.id);
      listingsByMaster.set(listing.masterProductId, ids);
    }
    const rowByListingAndDate = new Map(rows.map((row) => [
      `${row.listingId}\u0000${dateKey(row.businessDate)}`,
      row,
    ]));

    return requests.map((request) => {
      const expectedDates = expectedDatesByMaster.get(request.masterProductId) ?? [];
      const masterListingIds = listingsByMaster.get(request.masterProductId) ?? [];
      const expectedPairs = masterListingIds.flatMap((listingId) => expectedDates.map((date) => ({
        listingId,
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
      if (masterListingIds.length === 0 || expectedDates.length === 0 || foundRows.length === 0) {
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
        adSpend: masterListingIds.reduce((sum, listingId) =>
          sum + (rowByListingAndDate.get(`${listingId}\u0000${dateKey(businessDate)}`)?.adSpend ?? 0), 0),
      }));
      return {
        masterProductId: request.masterProductId,
        status: dailyFacts.every((fact) => fact.adSpend === 0) ? 'CONFIRMED_ZERO' : 'OBSERVED',
        coverageStartDate,
        coverageEndDate,
        capturedAt: latestCapturedAt(foundRows),
        dailyFacts,
      } satisfies MasterProductAdSpendEvidence;
    });
  }
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
