import type { ListingTrafficTotals, ListingTrafficDailyFact, ListingTrafficWindowFacts, ListingSaleStatusFact, ListingStateFact } from '../../../domain/listing/observation-facts';
export type { ListingTrafficTotals, ListingTrafficDailyFact, ListingTrafficWindowFacts, ListingSaleStatusFact, ListingStateFact } from '../../../domain/listing/observation-facts';
import { Prisma } from '@prisma/client';
import { addDays, businessDateKey } from '../../../../common/kst';
import { currentRowTieBreakSql } from '../../../../common/current-row';
import { readSucceededOperationWindows } from '../../../../common/operation/transaction/succeeded-operation-windows';
import { wingListingRegistrationDate } from '../../../domain/registration/wing-listing-registration';
import { readListingProductIds } from './listing-product-summary.reader';
import {
  WING_TRAFFIC_KIND,
  WingTrafficPlanSchema,
  WingTrafficResultSchema,
  dailyTrafficFactSource,
  type DailyTrafficFactSource,
} from '@kiditem/shared/advertising-operations';

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

  const populationCandidates = await prisma.channelListing.findMany({
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
    },
    select: { id: true, channelAccountId: true },
    orderBy: { id: 'asc' },
  });
  const listingProductIds = input.requireMasterProductLink
    ? await readListingProductIds(prisma, {
      organizationId: input.organizationId,
      listingIds: populationCandidates.map((listing) => listing.id),
    })
    : new Map<string, string | null>();
  const population = input.requireMasterProductLink
    ? populationCandidates.filter((listing) => listingProductIds.get(listing.id) !== null)
    : populationCandidates;
  const rowListingIds = input.requireMasterProductLink
    ? population.map((listing) => listing.id)
    : input.listingIds;
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
        ...(rowListingIds ? { listingId: { in: [...rowListingIds] } } : {}),
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
  // The Wing traffic runs are Advertising's `advertising.wing_traffic` operations
  // (KID-362): each succeeded run names the dates it confirmed in its result.
  const relevantAccounts = new Set(relevantAccountIds);
  const completedAttempts = relevantAccountIds.length > 0
    ? (await readSucceededOperationWindows(prisma, {
        organizationId: input.organizationId,
        kinds: [WING_TRAFFIC_KIND],
        firstDate: input.from ? calendarDate(input.from) : '0001-01-01',
        lastDate: input.to ? calendarDate(addDays(input.to, -1)) : '9999-12-31',
      })).flatMap((operation): CompletedTrafficAttempt[] => {
        const plan = WingTrafficPlanSchema.safeParse(operation.plan);
        const result = WingTrafficResultSchema.safeParse(operation.result);
        if (!plan.success || !result.success || !relevantAccounts.has(plan.data.channelAccountId)) return [];
        return [{
          id: operation.id,
          channelAccountId: plan.data.channelAccountId,
          confirmedDates: result.data.confirmedDates,
          providerBackedEmptyDates: result.data.providerBackedEmptyDates,
          unmatchedOptionIdsByDate: result.data.unmatchedOptionIdsByDate,
          startedAt: operation.startedAt,
          finishedAt: operation.finishedAt ?? operation.startedAt,
        }];
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
    (earliest, [, attempt]) => (!earliest || attempt.startedAt < earliest ? attempt.startedAt : earliest),
    null,
  );
  const selectedAccountIds = [...new Set(selected.flatMap(([, attempt]) =>
    attempt.channelAccountId ? [attempt.channelAccountId] : []))];
  const lateListings = earliestAttemptStart
    ? (await prisma.$queryRaw<Array<{
        channelAccountId: string;
        createdAt: Date;
        createdOn: string | null;
        salesProductId: string | null;
      }>>`
        SELECT channel_account_id AS "channelAccountId",
               created_at AS "createdAt",
               raw_json ->> 'createdOn' AS "createdOn",
               sales_product_id AS "salesProductId"
        FROM channel_listings
        WHERE organization_id = ${input.organizationId}::uuid
          AND channel_account_id = ANY(${selectedAccountIds}::uuid[])
          AND is_active = TRUE
          AND created_at >= ${earliestAttemptStart.toISOString()}::timestamptz
      `).map((listing) => ({
        channelAccountId: listing.channelAccountId,
        createdAt: listing.createdAt,
        registeredOn: wingListingRegistrationDate(listing),
      }))
    : [];
  // KID-217: a Wing row the run could not match to its catalog, whose option an
  // active listing of the account now carries (a catalog write that committed
  // after the run, or a listing active again), left that listing's traffic out
  // of the day. The account-date is not collected, as with a late listing.
  const unmatchedOptionIds = [...new Set(selected.flatMap(([key, attempt]) =>
    attempt.unmatchedOptionIdsByDate[key.slice(key.lastIndexOf(':') + 1)] ?? []))];
  const nowCatalogued = unmatchedOptionIds.length > 0
    ? await prisma.channelListingOption.findMany({
        where: {
          organizationId: input.organizationId,
          externalOptionId: { in: unmatchedOptionIds },
          listing: { is: { organizationId: input.organizationId, isActive: true, channelAccountId: { in: selectedAccountIds } } },
        },
        select: { externalOptionId: true, listing: { select: { channelAccountId: true } } },
      })
    : [];
  const lateListingDates = new Set(selected.flatMap(([key, attempt]) => {
    const date = key.slice(key.lastIndexOf(':') + 1);
    const late = lateListings.some((listing) =>
      listing.channelAccountId === attempt.channelAccountId
      && listing.createdAt >= attempt.startedAt
      && (listing.registeredOn === null || listing.registeredOn <= date));
    const unmatched = new Set(attempt.unmatchedOptionIdsByDate[date] ?? []);
    const reportedButUnmatched = nowCatalogued.some((option) =>
      option.listing.channelAccountId === attempt.channelAccountId && unmatched.has(option.externalOptionId));
    return late || reportedButUnmatched ? [key] : [];
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
    (latest, attempt) => latestDate(latest, attempt.finishedAt),
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

/** One succeeded `advertising.wing_traffic` operation of an account (KID-362). */
type CompletedTrafficAttempt = Readonly<{
  id: string;
  channelAccountId: string;
  confirmedDates: readonly string[];
  providerBackedEmptyDates: readonly string[];
  unmatchedOptionIdsByDate: Readonly<Record<string, readonly string[]>>;
  startedAt: Date;
  finishedAt: Date;
}>;

function latestCompletedAttemptByAccountDate(
  attempts: readonly CompletedTrafficAttempt[],
  bounds: Readonly<{ from?: Date; to?: Date }>,
): Map<string, CompletedTrafficAttempt> {
  const selected = new Map<string, CompletedTrafficAttempt>();
  for (const attempt of attempts) {
    if (!attempt.channelAccountId) continue;
    for (const date of [...new Set(attempt.confirmedDates)].sort()) {
      if (!dateInBounds(date, bounds)) continue;
      const key = accountDateKey(attempt.channelAccountId, date);
      const current = selected.get(key);
      if (!current || newerAttempt(attempt, current)) selected.set(key, attempt);
    }
  }
  return selected;
}

function newerAttempt(left: CompletedTrafficAttempt, right: CompletedTrafficAttempt): boolean {
  if (left.startedAt.getTime() !== right.startedAt.getTime()) {
    return left.startedAt > right.startedAt;
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
  return attempt.providerBackedEmptyDates.includes(businessDate);
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
