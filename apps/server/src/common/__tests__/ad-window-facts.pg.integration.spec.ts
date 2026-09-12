import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  readAdWindowFacts,
  readLatestAdDate,
  readListingAdWindowFacts,
  readListingDayAdFacts,
} from '../ad-window-facts';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  OTHER_ORGANIZATION_ID,
  IDOR_SENTINEL,
} from '../../test-helpers/real-prisma';
import {
  setupMaster,
  setupProductOption,
  setupChannelListing,
  seedAd,
  seedCompletedAdSweepRun,
} from '../../test-helpers/finance-seeds';

/**
 * The one reader of listing-day ad values, over the advertising target-day
 * ledger. What these cases pin down is the evidence gate: a day is measured
 * when a product-grain target row exists for it, from a completed campaign
 * sweep or from the pre-cutover history; a day without a row is absent, never
 * zero; and a superseded generation loses to the newer one instead of being
 * summed with it.
 */
describe('ad-window-facts (PG)', () => {
  let prisma: PrismaClient;
  const day = (d: string) => new Date(`${d}T00:00:00.000Z`);

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  async function listing(organizationId: string, code: string) {
    const master = await setupMaster(prisma, { organizationId, code, name: `Listing ${code}` });
    const option = await setupProductOption(prisma, {
      organizationId,
      masterId: master.id,
      sku: `${code}-OPT`,
    });
    return setupChannelListing(prisma, {
      organizationId,
      masterId: master.id,
      channel: 'coupang',
      externalId: `EXT-${code}`,
      optionId: option.id,
      externalOptionId: `VI-${code}`,
    });
  }

  it('a day with a product-grain row is measured; a day without one is absent, not zero', async () => {
    const a = await listing(TEST_ORGANIZATION_ID, 'A');
    await seedAd(prisma, { organizationId: TEST_ORGANIZATION_ID, listingId: a.listingId, date: '2026-04-10', spend: 300, revenue: 900, clicks: 3 });
    await seedAd(prisma, { organizationId: TEST_ORGANIZATION_ID, listingId: a.listingId, date: '2026-04-12', spend: 0 });

    const facts = await readAdWindowFacts(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      from: day('2026-04-10'),
      to: day('2026-04-13'),
    });

    expect(facts.days.map((d) => d.businessDate)).toEqual(['2026-04-10', '2026-04-12']);
    expect(facts.days[0]).toMatchObject({ spend: 300, revenue: 900, clicks: 3 });
    expect(facts.days[1]).toMatchObject({ spend: 0 });
    expect(facts.observedAt).toEqual(day('2026-04-12'));
  });

  it('sums several product rows of one listing on one day, per listing and per listing-day', async () => {
    const a = await listing(TEST_ORGANIZATION_ID, 'A');
    const b = await listing(TEST_ORGANIZATION_ID, 'B');
    await seedAd(prisma, { organizationId: TEST_ORGANIZATION_ID, listingId: a.listingId, date: '2026-04-10', spend: 100, targetKey: 'product:A:opt1' });
    await seedAd(prisma, { organizationId: TEST_ORGANIZATION_ID, listingId: a.listingId, date: '2026-04-10', spend: 150, targetKey: 'product:A:opt2' });
    await seedAd(prisma, { organizationId: TEST_ORGANIZATION_ID, listingId: a.listingId, date: '2026-04-11', spend: 50 });
    await seedAd(prisma, { organizationId: TEST_ORGANIZATION_ID, listingId: b.listingId, date: '2026-04-11', spend: 20 });

    const perListing = await readListingAdWindowFacts(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      from: day('2026-04-10'),
      to: day('2026-04-12'),
    });
    const byListing = new Map(perListing.map((row) => [row.listingId, row]));
    expect(byListing.get(a.listingId)).toMatchObject({ days: 2, spend: 300, firstDate: '2026-04-10', lastDate: '2026-04-11' });
    expect(byListing.get(b.listingId)).toMatchObject({ days: 2, spend: 20 });

    const perDay = await readListingDayAdFacts(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      from: day('2026-04-10'),
      to: day('2026-04-12'),
    });
    const named = perDay.map((row) => [row.listingId === a.listingId ? 'A' : 'B', row.businessDate.toISOString().slice(0, 10), row.spend] as const);
    expect(named[0]).toEqual(['A', '2026-04-10', 250]);
    expect(named.slice(1)).toEqual(expect.arrayContaining([['A', '2026-04-11', 50], ['B', '2026-04-11', 20]]));
    expect(named).toHaveLength(3);
  });

  it('a newer completed sweep generation supersedes an older one for the same target-day; a running one is not evidence', async () => {
    const a = await listing(TEST_ORGANIZATION_ID, 'A');
    const gen1 = await seedCompletedAdSweepRun(prisma, { organizationId: TEST_ORGANIZATION_ID, generation: 1 });
    const gen2 = await seedCompletedAdSweepRun(prisma, { organizationId: TEST_ORGANIZATION_ID, generation: 2 });
    const running = await seedCompletedAdSweepRun(prisma, { organizationId: TEST_ORGANIZATION_ID, generation: 3, status: 'running' });
    await seedAd(prisma, { organizationId: TEST_ORGANIZATION_ID, listingId: a.listingId, date: '2026-04-10', spend: 100, runId: gen1 });
    await seedAd(prisma, { organizationId: TEST_ORGANIZATION_ID, listingId: a.listingId, date: '2026-04-10', spend: 120, runId: gen2 });
    await seedAd(prisma, { organizationId: TEST_ORGANIZATION_ID, listingId: a.listingId, date: '2026-04-11', spend: 999, runId: running });

    const facts = await readAdWindowFacts(prisma, { organizationId: TEST_ORGANIZATION_ID, from: day('2026-04-10'), to: day('2026-04-12') });

    expect(facts.days).toHaveLength(1);
    expect(facts.days[0]).toMatchObject({ businessDate: '2026-04-10', spend: 120 });
  });

  it('a completed sweep measures every date of its declared window, with a zero day where it found no advertising', async () => {
    const a = await listing(TEST_ORGANIZATION_ID, 'A');
    const run = await seedCompletedAdSweepRun(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      generation: 1,
      window: { startDate: '2026-04-10', endDate: '2026-04-12' },
    });
    await seedAd(prisma, { organizationId: TEST_ORGANIZATION_ID, listingId: a.listingId, date: '2026-04-11', spend: 30, runId: run });

    const facts = await readAdWindowFacts(prisma, { organizationId: TEST_ORGANIZATION_ID, from: day('2026-04-09'), to: day('2026-04-14') });
    expect(facts.days.map((d) => [d.businessDate, d.spend])).toEqual([
      ['2026-04-10', 0], ['2026-04-11', 30], ['2026-04-12', 0],
    ]);

    const perListing = await readListingAdWindowFacts(prisma, { organizationId: TEST_ORGANIZATION_ID, from: day('2026-04-09'), to: day('2026-04-14') });
    expect(perListing[0]).toMatchObject({ listingId: a.listingId, days: 3, spend: 30 });
    expect(await readLatestAdDate(prisma, TEST_ORGANIZATION_ID)).toEqual(day('2026-04-12'));
  });

  it('a newer completed sweep that covers a date supersedes every older row on it, even targets it no longer reports', async () => {
    const a = await listing(TEST_ORGANIZATION_ID, 'A');
    const gen1 = await seedCompletedAdSweepRun(prisma, {
      organizationId: TEST_ORGANIZATION_ID, generation: 1, window: { startDate: '2026-04-10', endDate: '2026-04-11' },
    });
    await seedCompletedAdSweepRun(prisma, {
      organizationId: TEST_ORGANIZATION_ID, generation: 2, window: { startDate: '2026-04-11', endDate: '2026-04-12' },
    });
    await seedAd(prisma, { organizationId: TEST_ORGANIZATION_ID, listingId: a.listingId, date: '2026-04-10', spend: 100, runId: gen1 });
    await seedAd(prisma, { organizationId: TEST_ORGANIZATION_ID, listingId: a.listingId, date: '2026-04-11', spend: 100, runId: gen1 });

    const facts = await readAdWindowFacts(prisma, { organizationId: TEST_ORGANIZATION_ID, from: day('2026-04-10'), to: day('2026-04-13') });

    // 04-10: only gen1 swept it, its row stands. 04-11: gen2 swept it and
    // reported nothing, so the gen1 row is stopped spend, a measured zero.
    // 04-12: gen2 swept it, measured zero.
    expect(facts.days.map((d) => [d.businessDate, d.spend])).toEqual([
      ['2026-04-10', 100], ['2026-04-11', 0], ['2026-04-12', 0],
    ]);
  });

  it('a pre-cutover row without a run is still measured', async () => {
    const a = await listing(TEST_ORGANIZATION_ID, 'A');
    await seedAd(prisma, { organizationId: TEST_ORGANIZATION_ID, listingId: a.listingId, date: '2026-04-10', spend: 70, runId: null });

    expect(await readLatestAdDate(prisma, TEST_ORGANIZATION_ID)).toEqual(day('2026-04-10'));
  });

  it('a campaign rollup row is the account-level day; product rows under it are not added on top', async () => {
    const a = await listing(TEST_ORGANIZATION_ID, 'A');
    await seedAd(prisma, { organizationId: TEST_ORGANIZATION_ID, listingId: a.listingId, date: '2026-04-10', spend: 40 });
    const account = await prisma.channelListing.findUniqueOrThrow({ where: { id: a.listingId }, select: { channelAccountId: true } });
    await prisma.channelAdTargetDailySnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.channelAccountId,
        channel: 'coupang',
        businessDate: day('2026-04-10'),
        targetType: 'product',
        targetKey: 'campaign:c1',
        campaignIdentity: 'campaign:c1',
        spend: 100,
        adSpend: 100,
        metaJson: { data: { granularity: 'campaign' } },
      },
    });

    const facts = await readAdWindowFacts(prisma, { organizationId: TEST_ORGANIZATION_ID, from: day('2026-04-10'), to: day('2026-04-11') });
    expect(facts.days[0]).toMatchObject({ spend: 100 });

    const perListing = await readListingAdWindowFacts(prisma, { organizationId: TEST_ORGANIZATION_ID, from: day('2026-04-10'), to: day('2026-04-11') });
    expect(perListing).toHaveLength(1);
    expect(perListing[0]).toMatchObject({ listingId: a.listingId, spend: 40 });
  });

  it('never crosses the organization boundary', async () => {
    const a = await listing(TEST_ORGANIZATION_ID, 'A');
    const o = await listing(OTHER_ORGANIZATION_ID, 'O');
    await seedAd(prisma, { organizationId: TEST_ORGANIZATION_ID, listingId: a.listingId, date: '2026-04-10', spend: 10 });
    await seedAd(prisma, { organizationId: OTHER_ORGANIZATION_ID, listingId: o.listingId, date: '2026-04-10', spend: IDOR_SENTINEL });

    const facts = await readAdWindowFacts(prisma, { organizationId: TEST_ORGANIZATION_ID, from: day('2026-04-10'), to: day('2026-04-11') });
    expect(facts.days[0]?.spend).toBe(10);
    const perListing = await readListingAdWindowFacts(prisma, { organizationId: TEST_ORGANIZATION_ID });
    expect(perListing.every((row) => row.spend !== IDOR_SENTINEL)).toBe(true);
  });
});
