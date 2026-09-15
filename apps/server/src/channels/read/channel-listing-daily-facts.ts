import { Prisma } from '@prisma/client';
import { SOURCE_IMPORT_RUN_COMPLETED_STATUS } from '@kiditem/shared/source-import';
import { businessDateKey } from '../../common/kst';
import { currentRowTieBreakSql } from '../../common/current-row';
import { wingListingRegistrationDate } from '../domain/wing-listing-registration';
import {
  dailyTrafficFactSource,
  type DailyTrafficFactSource,
} from '@kiditem/shared/advertising';

export type ListingTrafficTotals = Readonly<{
  visitors: number;
  views: number;
  cartAdds: number;
  orders: number;
  salesQty: number;
  revenue: number;
}>;

export type ListingTrafficDailyFact = ListingTrafficTotals & Readonly<{
  listingId: string;
  businessDate: string;
  observedAt: Date;
  source: DailyTrafficFactSource | null;
}>;

export type ListingTrafficWindowFacts = Readonly<{
  rows: readonly ListingTrafficDailyFact[];
  /** Dates with an explicit traffic row before the current-generation fence. */
  observedDates: readonly string[];
  /** Owner-declared coverage for the listing population selected by this read. */
  coverage: Readonly<{
    includedDates: readonly string[];
    invalidDates: readonly string[];
    missingDates: readonly string[];
  }>;
  totals: ListingTrafficTotals;
  latestObservedAt: Date | null;
}>;

export type ListingSaleStatusFact = Readonly<{
  listingId: string;
  businessDate: string;
  saleStatus: string | null;
  observedAt: Date;
}>;

export async function readListingTrafficWindowFacts(
  prisma: Prisma.TransactionClient,
  input: Readonly<{
    organizationId: string;
    from?: Date;
    to?: Date;
    listingIds?: readonly string[];
    requireMasterProductLink?: boolean;
  }>,
): Promise<ListingTrafficWindowFacts> {
  if (input.listingIds?.length === 0) return emptyTrafficFacts();

  const rows = await prisma.channelListingDailySnapshot.findMany({
      where: {
        organizationId: input.organizationId,
        trafficObservedAt: { not: null },
        ...(input.from || input.to ? {
          businessDate: {
            ...(input.from ? { gte: input.from } : {}),
            ...(input.to ? { lt: input.to } : {}),
          },
        } : {}),
        ...(input.listingIds ? { listingId: { in: [...input.listingIds] } } : {}),
        listing: {
          is: {
            organizationId: input.organizationId,
            isActive: true,
            channelAccount: {
              is: {
                organizationId: input.organizationId,
                channel: 'coupang',
                status: 'active',
              },
            },
            ...(input.requireMasterProductLink ? {
              masterProductId: { not: null },
            } : {}),
          },
        },
      },
      orderBy: [{ businessDate: 'asc' }, { listingId: 'asc' }],
      select: {
        listingId: true,
        businessDate: true,
        trafficVisitors: true,
        trafficViews: true,
        trafficCartAdds: true,
        trafficOrders: true,
        trafficSalesQty: true,
        trafficRevenue: true,
        trafficObservedAt: true,
        metaJson: true,
        listing: {
          select: { channelAccountId: true },
        },
      },
    });
  const population = await prisma.channelListing.findMany({
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
        ...(input.listingIds ? { id: { in: [...input.listingIds] } } : {}),
        ...(input.requireMasterProductLink ? { masterProductId: { not: null } } : {}),
      },
      select: { id: true, channelAccountId: true },
      orderBy: { id: 'asc' },
    });

  const observedFacts = rows.flatMap((row) => row.trafficObservedAt ? [{
    listingId: row.listingId,
    channelAccountId: row.listing.channelAccountId,
    businessDate: calendarDate(row.businessDate),
    visitors: row.trafficVisitors,
    views: row.trafficViews,
    cartAdds: row.trafficCartAdds,
    orders: row.trafficOrders,
    salesQty: row.trafficSalesQty,
    revenue: row.trafficRevenue,
    observedAt: row.trafficObservedAt,
    source: dailyTrafficFactSource(row.metaJson),
    sourceAttemptId: wingSourceAttemptId(row.metaJson),
  }] : []);

  const populationAccountIds = [...new Set(population.map((listing) => listing.channelAccountId))];
  const populationIsFiltered = input.listingIds !== undefined || input.requireMasterProductLink === true;
  const fallbackAccounts = population.length === 0 && !populationIsFiltered
    ? await prisma.channelAccount.findMany({
        where: {
          organizationId: input.organizationId,
          channel: 'coupang',
          status: 'active',
        },
        select: { id: true },
        orderBy: { id: 'asc' },
      })
    : [];
  const relevantAccountIds = populationAccountIds.length > 0
    ? populationAccountIds
    : fallbackAccounts.map((account) => account.id);
  const completedAttempts = relevantAccountIds.length > 0
    ? await prisma.sourceImportRun.findMany({
        where: {
          organizationId: input.organizationId,
          sourceType: 'coupang_wing_traffic',
          status: SOURCE_IMPORT_RUN_COMPLETED_STATUS,
          channelAccountId: { in: relevantAccountIds },
        },
        select: {
          id: true,
          channelAccountId: true,
          freshnessGeneration: true,
          providerBackedEmptyProof: true,
          qualityReport: true,
          importedAt: true,
          lastVerifiedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      })
    : [];
  const selectedAttempts = latestCompletedAttemptByAccountDate(completedAttempts, input);
  const facts = observedFacts.filter((fact) => {
    if (fact.source !== 'wing') return true;
    const selected = selectedAttempts.get(
      accountDateKey(fact.channelAccountId, fact.businessDate),
    );
    if (!fact.sourceAttemptId) return selected === undefined;
    return selected?.id === fact.sourceAttemptId;
  });
  const publicFacts: ListingTrafficDailyFact[] = facts.map(
    ({ channelAccountId: _, sourceAttemptId: __, ...fact }) => fact,
  );
  const dates = readDates(input, observedFacts, selectedAttempts);
  // An attempt matched Wing's rows to the catalog it saw while it ran, so a
  // listing the catalog imported after the attempt started may be missing from
  // its report. A selected account-date is refused while such a listing is
  // active and was already registered on Wing by the date, or has no readable
  // registration date.
  const selected = [...selectedAttempts.entries()];
  const earliestAttemptStart = selected.reduce<Date | null>(
    (earliest, [, attempt]) => (!earliest || attempt.createdAt < earliest ? attempt.createdAt : earliest),
    null,
  );
  const lateListings = earliestAttemptStart
    ? (await prisma.channelListing.findMany({
        where: {
          organizationId: input.organizationId,
          channelAccountId: {
            in: [...new Set(selected.flatMap(([, attempt]) =>
              attempt.channelAccountId ? [attempt.channelAccountId] : []))],
          },
          isActive: true,
          createdAt: { gte: earliestAttemptStart },
        },
        select: { channelAccountId: true, createdAt: true, sourceCandidateId: true, rawJson: true },
      })).map((listing) => {
        const raw = listing.rawJson;
        const createdOn = raw && typeof raw === 'object' && !Array.isArray(raw)
          ? (raw as Record<string, unknown>).createdOn
          : undefined;
        return {
          channelAccountId: listing.channelAccountId,
          createdAt: listing.createdAt,
          registeredOn: wingListingRegistrationDate({
            createdOn: typeof createdOn === 'string' ? createdOn : null,
            sourceCandidateId: listing.sourceCandidateId,
            createdAt: listing.createdAt,
          }),
        };
      })
    : [];
  const lateListingDates = new Set(selected.flatMap(([key, attempt]) => {
    const date = key.slice(key.lastIndexOf(':') + 1);
    return lateListings.some((listing) =>
      listing.channelAccountId === attempt.channelAccountId
      && listing.createdAt >= attempt.createdAt
      && (listing.registeredOn === null || listing.registeredOn <= date))
      ? [key]
      : [];
  }));
  const coverage = coverageFor(
    dates,
    population,
    fallbackAccounts.map((account) => account.id),
    observedFacts,
    facts,
    selectedAttempts,
    lateListingDates,
  );
  const ownerObservedAt = [...selectedAttempts.values()].reduce<Date | null>(
    (latest, attempt) => latestDate(
      latest,
      attempt.importedAt ?? attempt.lastVerifiedAt ?? attempt.updatedAt,
    ),
    null,
  );
  const includedDates = new Set(coverage.includedDates);
  const includedFacts = publicFacts.filter((fact) => includedDates.has(fact.businessDate));

  return {
    rows: publicFacts,
    observedDates: [...new Set(observedFacts.map((row) => row.businessDate))],
    coverage,
    totals: sumTraffic(includedFacts),
    latestObservedAt: publicFacts.reduce<Date | null>(
      (latest, row) => latestDate(latest, row.observedAt),
      ownerObservedAt,
    ),
  };
}

export async function readLatestListingSaleStatusFacts(
  prisma: Prisma.TransactionClient,
  input: Readonly<{
    organizationId: string;
    listingIds: readonly string[];
  }>,
): Promise<readonly ListingSaleStatusFact[]> {
  const rows = await readLatestListingStateFacts(prisma, input);
  return rows.map((row) => ({
    listingId: row.listingId,
    businessDate: calendarDate(row.businessDate),
    saleStatus: row.saleStatus,
    observedAt: row.lastObservedAt,
  }));
}

export type ListingStateFact = Readonly<{
  listingId: string;
  channel: string;
  externalId: string;
  businessDate: Date;
  lastObservedAt: Date;
  sampleCount: number;
  productName: string | null;
  status: string | null;
  exposureStatus: string | null;
  saleStatus: string | null;
  channelPrice: number | null;
  isOfferWinner: boolean | null;
  myPrice: number | null;
  winnerPrice: number | null;
  winnerGapPrice: number | null;
  productRank: number | null;
  categoryRank: number | null;
}>;

/** State observations have their own provenance; traffic collection is independent. */
export async function readLatestListingStateFacts(
  prisma: Prisma.TransactionClient,
  input: Readonly<{
    organizationId: string;
    listingIds: readonly string[];
  }>,
): Promise<readonly ListingStateFact[]> {
  if (input.listingIds.length === 0) return [];
  return prisma.$queryRaw<ListingStateFact[]>(Prisma.sql`
    SELECT DISTINCT ON (listing_id)
      listing_id          AS "listingId",
      channel,
      external_id         AS "externalId",
      business_date       AS "businessDate",
      last_observed_at    AS "lastObservedAt",
      sample_count        AS "sampleCount",
      product_name        AS "productName",
      status,
      exposure_status     AS "exposureStatus",
      sale_status         AS "saleStatus",
      channel_price       AS "channelPrice",
      is_offer_winner     AS "isOfferWinner",
      my_price            AS "myPrice",
      winner_price        AS "winnerPrice",
      winner_gap_price    AS "winnerGapPrice",
      product_rank        AS "productRank",
      category_rank       AS "categoryRank"
    FROM channel_listing_daily_snapshots
    WHERE organization_id = ${input.organizationId}::uuid
      AND listing_id = ANY(${[...input.listingIds]}::uuid[])
      -- A row that observed only traffic (a Wing zero row, say) carries no
      -- listing state and must not hide an older state observation.
      AND num_nonnulls(
        product_name, status, exposure_status, sale_status, channel_price,
        is_offer_winner, my_price, winner_price, winner_gap_price,
        product_rank, category_rank
      ) > 0
    ORDER BY
      listing_id,
      ${currentRowTieBreakSql({
        businessDate: Prisma.sql`business_date`,
        observedAt: Prisma.sql`last_observed_at`,
        updatedAt: Prisma.sql`updated_at`,
        id: Prisma.sql`id`,
      })}
  `);
}

function emptyTrafficFacts(): ListingTrafficWindowFacts {
  return {
    rows: [],
    observedDates: [],
    coverage: { includedDates: [], invalidDates: [], missingDates: [] },
    totals: {
      visitors: 0,
      views: 0,
      cartAdds: 0,
      orders: 0,
      salesQty: 0,
      revenue: 0,
    },
    latestObservedAt: null,
  };
}

function sumTraffic(rows: readonly ListingTrafficDailyFact[]): ListingTrafficTotals {
  return rows.reduce<ListingTrafficTotals>((total, row) => ({
    visitors: total.visitors + row.visitors,
    views: total.views + row.views,
    cartAdds: total.cartAdds + row.cartAdds,
    orders: total.orders + row.orders,
    salesQty: total.salesQty + row.salesQty,
    revenue: total.revenue + row.revenue,
  }), emptyTrafficFacts().totals);
}

function calendarDate(value: Date): string {
  return businessDateKey(value);
}

type PopulationListing = Readonly<{ id: string; channelAccountId: string }>;

type ObservedTrafficFact = ListingTrafficDailyFact & Readonly<{
  channelAccountId: string;
  sourceAttemptId: string | null;
}>;

type CompletedTrafficAttempt = Readonly<{
  id: string;
  channelAccountId: string | null;
  freshnessGeneration: bigint | null;
  providerBackedEmptyProof: boolean | null;
  qualityReport: Prisma.JsonValue | null;
  importedAt: Date | null;
  lastVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}>;

function latestCompletedAttemptByAccountDate(
  attempts: readonly CompletedTrafficAttempt[],
  bounds: Readonly<{ from?: Date; to?: Date }>,
): Map<string, CompletedTrafficAttempt> {
  const selected = new Map<string, CompletedTrafficAttempt>();
  for (const attempt of attempts) {
    if (!attempt.channelAccountId) continue;
    for (const date of confirmedDates(attempt.qualityReport)) {
      if (!dateInBounds(date, bounds)) continue;
      const key = accountDateKey(attempt.channelAccountId, date);
      const current = selected.get(key);
      if (!current || newerAttempt(attempt, current)) selected.set(key, attempt);
    }
  }
  return selected;
}

function confirmedDates(value: Prisma.JsonValue | null): string[] {
  if (!value || Array.isArray(value) || typeof value !== 'object') return [];
  const dates = (value as Record<string, unknown>).confirmedDates;
  if (!Array.isArray(dates)) return [];
  return [...new Set(dates.filter(isCalendarDate))].sort();
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && calendarDate(date) === value;
}

function newerAttempt(left: CompletedTrafficAttempt, right: CompletedTrafficAttempt): boolean {
  const leftGeneration = left.freshnessGeneration ?? -1n;
  const rightGeneration = right.freshnessGeneration ?? -1n;
  if (leftGeneration !== rightGeneration) return leftGeneration > rightGeneration;
  if (left.createdAt.getTime() !== right.createdAt.getTime()) {
    return left.createdAt > right.createdAt;
  }
  return left.id > right.id;
}

function wingSourceAttemptId(value: Prisma.JsonValue | null): string | null {
  if (!value || Array.isArray(value) || typeof value !== 'object') return null;
  const wing = (value as Record<string, unknown>)['wing.traffic'];
  if (!wing || Array.isArray(wing) || typeof wing !== 'object') return null;
  const attemptId = (wing as Record<string, unknown>).sourceAttemptId;
  return typeof attemptId === 'string' ? attemptId : null;
}

function readDates(
  input: Readonly<{ from?: Date; to?: Date }>,
  observedFacts: readonly ObservedTrafficFact[],
  selectedAttempts: ReadonlyMap<string, CompletedTrafficAttempt>,
): string[] {
  if (input.from && input.to) return enumerateHalfOpenDates(input.from, input.to);
  const dates = new Set(observedFacts.map((fact) => fact.businessDate));
  for (const key of selectedAttempts.keys()) dates.add(key.slice(key.lastIndexOf(':') + 1));
  return [...dates].filter((date) => dateInBounds(date, input)).sort();
}

function enumerateHalfOpenDates(from: Date, to: Date): string[] {
  const dates: string[] = [];
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  while (cursor < end) {
    dates.push(calendarDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function dateInBounds(
  date: string,
  bounds: Readonly<{ from?: Date; to?: Date }>,
): boolean {
  const value = new Date(`${date}T00:00:00.000Z`);
  return (!bounds.from || value >= bounds.from) && (!bounds.to || value < bounds.to);
}

function coverageFor(
  dates: readonly string[],
  population: readonly PopulationListing[],
  fallbackAccountIds: readonly string[],
  observedFacts: readonly ObservedTrafficFact[],
  facts: readonly ObservedTrafficFact[],
  selectedAttempts: ReadonlyMap<string, CompletedTrafficAttempt>,
  lateListingDates: ReadonlySet<string>,
): ListingTrafficWindowFacts['coverage'] {
  const includedDates: string[] = [];
  const invalidDates: string[] = [];
  const missingDates: string[] = [];
  const factKeys = new Set(facts.map((fact) => listingDateKey(fact.listingId, fact.businessDate)));
  const observedDates = new Set(observedFacts.map((fact) => fact.businessDate));
  const keptFacts = new Set(facts);
  // A Wing row the date's selected attempt did not publish was dropped as
  // stale, so that listing's value on the date is unknown.
  const staleWingDates = new Set(observedFacts
    .filter((fact) => fact.source === 'wing' && !keptFacts.has(fact))
    .map((fact) => fact.businessDate));

  for (const date of dates) {
    const attempts = new Map<string, CompletedTrafficAttempt>();
    for (const listing of population) {
      const attempt = selectedAttempts.get(accountDateKey(listing.channelAccountId, date));
      if (attempt) attempts.set(listing.channelAccountId, attempt);
    }
    for (const accountId of fallbackAccountIds) {
      const attempt = selectedAttempts.get(accountDateKey(accountId, date));
      if (attempt) attempts.set(accountId, attempt);
    }
    const hasObservedRow = observedDates.has(date);
    const hasEvidence = hasObservedRow || attempts.size > 0;
    // A date the account's selected attempt confirmed is collected for all of
    // its listings: the traffic owner published a zero row for a listing Wing
    // left out, and a listing without a row stays unmeasured. An account
    // without an attempt (a CSV upload) still needs a row for every listing.
    // A listing the catalog imported after the attempt started, and already
    // registered on Wing by the date, may be missing from the report, so the
    // date is not collected for its account.
    const complete = population.length > 0
      ? !staleWingDates.has(date)
        && ![...attempts.keys()].some((accountId) =>
          lateListingDates.has(accountDateKey(accountId, date)))
        && population.every((listing) =>
          attempts.has(listing.channelAccountId)
          || factKeys.has(listingDateKey(listing.id, date)))
      : fallbackAccountIds.length > 0
        ? fallbackAccountIds.every((accountId) =>
            attemptProvesEmptyDate(attempts.get(accountId), date))
        : hasObservedRow;

    if (complete) includedDates.push(date);
    else if (hasEvidence) invalidDates.push(date);
    else missingDates.push(date);
  }
  return { includedDates, invalidDates, missingDates };
}

function attemptProvesEmptyDate(
  attempt: CompletedTrafficAttempt | undefined,
  businessDate: string,
): boolean {
  if (!attempt) return false;
  // Older all-empty completions carry only the run-level proof. A mixed run
  // must name the independently verified empty date in its quality report.
  if (attempt.providerBackedEmptyProof === true) return true;
  if (!attempt.qualityReport
    || Array.isArray(attempt.qualityReport)
    || typeof attempt.qualityReport !== 'object') return false;
  const dates = (attempt.qualityReport as Record<string, unknown>).providerBackedEmptyDates;
  return Array.isArray(dates) && dates.some((date) => date === businessDate);
}

function listingDateKey(listingId: string, date: string): string {
  return `${listingId}:${date}`;
}

function accountDateKey(accountId: string, date: string): string {
  return `${accountId}:${date}`;
}

function latestDate(left: Date | null, right: Date): Date {
  return !left || right > left ? right : left;
}
