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
 * only when a completed campaign sweep declares it; a day inside that window
 * may be a measured zero, while rows with no completion proof remain
 * unavailable; and a superseded generation loses to the newer one instead of
 * being summed with it.
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

  async function listing(
    organizationId: string,
    code: string,
    channelAccountId?: string,
  ) {
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
      channelAccountId,
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
    const gen1 = await seedCompletedAdSweepRun(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      generation: 1,
      window: { startDate: '2026-04-10', endDate: '2026-04-10' },
    });
    const gen2 = await seedCompletedAdSweepRun(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      generation: 2,
      window: { startDate: '2026-04-10', endDate: '2026-04-10' },
    });
    const running = await seedCompletedAdSweepRun(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      generation: 3,
      status: 'running',
      window: { startDate: '2026-04-11', endDate: '2026-04-11' },
    });
    const failed = await seedCompletedAdSweepRun(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      generation: 4,
      status: 'failed',
      window: { startDate: '2026-04-11', endDate: '2026-04-11' },
    });
    await seedAd(prisma, { organizationId: TEST_ORGANIZATION_ID, listingId: a.listingId, date: '2026-04-10', spend: 100, runId: gen1 });
    await seedAd(prisma, { organizationId: TEST_ORGANIZATION_ID, listingId: a.listingId, date: '2026-04-10', spend: 120, runId: gen2 });
    await seedAd(prisma, { organizationId: TEST_ORGANIZATION_ID, listingId: a.listingId, date: '2026-04-11', spend: 999, runId: running });
    await seedAd(prisma, { organizationId: TEST_ORGANIZATION_ID, listingId: a.listingId, date: '2026-04-11', spend: 888, runId: failed });

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

  it('a pre-cutover row without a completed declaration is unavailable', async () => {
    const a = await listing(TEST_ORGANIZATION_ID, 'A');
    await seedAd(prisma, { organizationId: TEST_ORGANIZATION_ID, listingId: a.listingId, date: '2026-04-10', spend: 70, runId: null });

    expect(await readLatestAdDate(prisma, TEST_ORGANIZATION_ID)).toBeNull();
    await expect(readAdWindowFacts(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      from: day('2026-04-10'),
      to: day('2026-04-11'),
    })).resolves.toEqual({ days: [], observedAt: null });
  });

  it('does not treat requested plan dates as a completed coverage declaration', async () => {
    const a = await listing(TEST_ORGANIZATION_ID, 'PLAN-ONLY');
    const run = await seedCompletedAdSweepRun(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      generation: 1,
      window: { startDate: '2026-04-10', endDate: '2026-04-10' },
    });
    await prisma.sourceImportRun.update({
      where: { id: run },
      data: { coverageStartDate: null, coverageEndDate: null },
    });
    await seedAd(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      listingId: a.listingId,
      date: '2026-04-10',
      spend: 70,
      runId: run,
    });

    await expect(readAdWindowFacts(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      from: day('2026-04-10'),
      to: day('2026-04-11'),
    })).resolves.toEqual({ days: [], observedAt: null });
  });

  it('keeps an organization day unavailable while an active account has no completed declaration', async () => {
    const a = await listing(TEST_ORGANIZATION_ID, 'COMPLETE-ACCOUNT');
    const accountA = await prisma.channelListing.findUniqueOrThrow({
      where: { id: a.listingId },
      select: { channelAccountId: true },
    });
    const accountB = await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        externalAccountId: 'UNMEASURED-ACCOUNT',
        name: 'Unmeasured account',
        status: 'active',
      },
      select: { id: true },
    });
    await listing(TEST_ORGANIZATION_ID, 'UNMEASURED-ACCOUNT', accountB.id);
    const runA = await seedCompletedAdSweepRun(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      channelAccountId: accountA.channelAccountId,
      generation: 1,
      window: { startDate: '2026-04-10', endDate: '2026-04-10' },
    });
    await seedAd(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      listingId: a.listingId,
      date: '2026-04-10',
      spend: 10,
      runId: runA,
    });

    await expect(readAdWindowFacts(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      from: day('2026-04-10'),
      to: day('2026-04-11'),
    })).resolves.toEqual({ days: [], observedAt: null });
    await expect(readListingAdWindowFacts(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      from: day('2026-04-10'),
      to: day('2026-04-11'),
    })).resolves.toEqual([]);
    await expect(readLatestAdDate(prisma, TEST_ORGANIZATION_ID)).resolves.toBeNull();
  });

  it('uses the shared account coverage dates for listing totals and date bounds', async () => {
    const a = await listing(TEST_ORGANIZATION_ID, 'LONGER-ACCOUNT');
    const accountA = await prisma.channelListing.findUniqueOrThrow({
      where: { id: a.listingId },
      select: { channelAccountId: true },
    });
    const accountB = await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        externalAccountId: 'SHORTER-ACCOUNT',
        name: 'Shorter account',
        status: 'active',
      },
      select: { id: true },
    });
    await listing(TEST_ORGANIZATION_ID, 'SHORTER-ACCOUNT', accountB.id);
    const runA = await seedCompletedAdSweepRun(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      channelAccountId: accountA.channelAccountId,
      generation: 1,
      window: { startDate: '2026-04-01', endDate: '2026-04-10' },
    });
    await seedCompletedAdSweepRun(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      channelAccountId: accountB.id,
      generation: 1,
      window: { startDate: '2026-04-06', endDate: '2026-04-10' },
    });
    await seedAd(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      listingId: a.listingId,
      date: '2026-04-01',
      spend: 100,
      runId: runA,
    });
    await seedAd(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      listingId: a.listingId,
      date: '2026-04-06',
      spend: 20,
      runId: runA,
    });

    const perListing = await readListingAdWindowFacts(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      from: day('2026-04-01'),
      to: day('2026-04-11'),
    });
    expect(perListing).toHaveLength(1);
    expect(perListing[0]).toMatchObject({
      listingId: a.listingId,
      days: 5,
      spend: 20,
      firstDate: '2026-04-06',
      lastDate: '2026-04-06',
    });

    const perDay = await readListingDayAdFacts(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      from: day('2026-04-01'),
      to: day('2026-04-11'),
    });
    expect(perDay.map(({ businessDate, spend }) => [
      businessDate.toISOString().slice(0, 10),
      spend,
    ])).toEqual([['2026-04-06', 20]]);
  });

  it('selects campaign or product grain per account-day without crossing account fences', async () => {
    const a = await listing(TEST_ORGANIZATION_ID, 'ACCOUNT-A');
    const accountA = await prisma.channelListing.findUniqueOrThrow({
      where: { id: a.listingId },
      select: { channelAccountId: true },
    });
    const accountB = await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        externalAccountId: 'ACCOUNT-B',
        name: 'Account B',
        status: 'active',
      },
      select: { id: true },
    });
    const b = await listing(TEST_ORGANIZATION_ID, 'ACCOUNT-B', accountB.id);
    const runA1 = await seedCompletedAdSweepRun(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      channelAccountId: accountA.channelAccountId,
      generation: 1,
      window: { startDate: '2026-04-10', endDate: '2026-04-12' },
    });
    const runB1 = await seedCompletedAdSweepRun(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      channelAccountId: accountB.id,
      generation: 1,
      window: { startDate: '2026-04-10', endDate: '2026-04-12' },
    });
    const campaignRow = async (
      channelAccountId: string,
      runId: string,
      date: string,
      spend: number,
    ) => prisma.channelAdTargetDailySnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId,
        channel: 'coupang',
        businessDate: day(date),
        targetType: 'product',
        targetKey: 'campaign:shared',
        campaignIdentity: 'campaign:shared',
        sourceImportRunId: runId,
        spend,
        adSpend: spend,
        metaJson: { data: { granularity: 'campaign' } },
      },
    });
    await campaignRow(accountA.channelAccountId, runA1, '2026-04-10', 10);
    await seedAd(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      listingId: b.listingId,
      date: '2026-04-10',
      spend: 20,
      runId: runB1,
    });
    await campaignRow(accountA.channelAccountId, runA1, '2026-04-11', 11);
    await campaignRow(accountB.id, runB1, '2026-04-11', 13);
    await seedAd(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      listingId: b.listingId,
      date: '2026-04-11',
      spend: 99,
      runId: runB1,
    });
    await campaignRow(accountA.channelAccountId, runA1, '2026-04-12', 5);
    await seedAd(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      listingId: b.listingId,
      date: '2026-04-12',
      spend: 7,
      runId: runB1,
    });
    // A target cannot borrow the other account's completed declaration.
    await seedAd(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      listingId: b.listingId,
      date: '2026-04-10',
      spend: 1_000,
      runId: runA1,
      targetKey: 'product:borrowed-declaration',
    });
    // A's newer zero sweep replaces only A's old day; B's 7 remains current.
    await seedCompletedAdSweepRun(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      channelAccountId: accountA.channelAccountId,
      generation: 2,
      window: { startDate: '2026-04-12', endDate: '2026-04-12' },
    });

    const facts = await readAdWindowFacts(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      from: day('2026-04-10'),
      to: day('2026-04-13'),
    });

    expect(facts.days.map(({ businessDate, spend }) => [businessDate, spend])).toEqual([
      ['2026-04-10', 30],
      ['2026-04-11', 24],
      ['2026-04-12', 7],
    ]);
  });

  it('a campaign rollup row is the account-level day; product rows under it are not added on top', async () => {
    const a = await listing(TEST_ORGANIZATION_ID, 'A');
    const run = await seedCompletedAdSweepRun(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      generation: 1,
      window: { startDate: '2026-04-10', endDate: '2026-04-10' },
    });
    await seedAd(prisma, { organizationId: TEST_ORGANIZATION_ID, listingId: a.listingId, date: '2026-04-10', spend: 40, runId: run });
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
        sourceImportRunId: run,
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
