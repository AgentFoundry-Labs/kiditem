import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  OTHER_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import {
  canonicalProviderRowsChecksum,
  ProfitabilityAdImportRepositoryAdapter,
  PROFITABILITY_SOURCE_TYPE,
  profitabilityCoverageForKstYesterday,
} from '../adapter/out/repository/profitability-ad-import.repository.adapter';
import { readMonthlyAdAllocationPublication } from '../read/monthly-ad-allocation.reader';
import { lockProductMapping } from '../../common/product-mapping-generation';
import type { PrismaClient } from '@prisma/client';
import type {
  AdvertisingProfitabilityPlan,
  AdvertisingProfitabilitySliceUpload,
} from '../application/port/in/profitability-ad-import.port';

const FIRST_KEY = 'advertising-pg-first';
const SECOND_KEY = 'advertising-pg-second';

describe('Advertising profitability source owner (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let owner: ProfitabilityAdImportRepositoryAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    owner = createOwner(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await seedAccount(prisma, TEST_ORGANIZATION_ID, 'account-a', 'ADVERTISER-A', 'A');
    await seedAccount(prisma, TEST_ORGANIZATION_ID, 'account-b', 'ADVERTISER-B', 'B');
  });

  it('freezes exact partial-month coverage and proves allocations over that period', async () => {
    const coverage = profitabilityCoverageForKstYesterday(new Date());
    const cutoffPeriod = coverage.periods.at(-1)!;
    const attempt = await owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: FIRST_KEY,
    });

    expect(attempt.accounts).toHaveLength(2);
    expect(attempt.accounts[0]?.slices).toHaveLength(12);
    expect(attempt.accounts[0]?.slices.at(-1)).toMatchObject({
      from: cutoffPeriod.from,
      to: cutoffPeriod.to,
      businessDates: cutoffPeriod.businessDates,
    });
    await expect(prisma.sourceImportRun.findUnique({ where: { id: attempt.attemptId } }))
      .resolves.toMatchObject({
        coverageStartDate: new Date(`${coverage.from}T00:00:00.000Z`),
        coverageEndDate: new Date(`${coverage.to}T00:00:00.000Z`),
        coveredMonths: coverage.months,
      });

    const frozenFacts = await prisma.channelAdListingProductMonthlyFact.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID, sourceImportRunId: attempt.attemptId },
    });
    const cutoffFacts = frozenFacts.filter((fact) =>
      fact.month.toISOString().slice(0, 7) === cutoffPeriod.month);
    expect(cutoffFacts).toHaveLength(2);
    expect(cutoffFacts.every((fact) =>
      fact.coveredStartDate.toISOString().slice(0, 10) === cutoffPeriod.from
      && fact.coveredEndDate.toISOString().slice(0, 10) === cutoffPeriod.to
      && fact.observedTargetDayCount === 0)).toBe(true);

    await uploadAllSlices(owner, attempt);
    const published = await owner.finalizeAttempt(fence(attempt));
    expect(published).toMatchObject({
      latestComplete: {
        coveredThrough: coverage.to,
        qualitySummary: {
          providerSpendKrw: 168,
          allocatedSpendKrw: 168,
        },
      },
      ready: true,
    });

    const receipts = await prisma.channelScrapeRun.findMany({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceImportRunId: attempt.attemptId,
        periodEnd: new Date(`${coverage.to}T00:00:00.000Z`),
      },
    });
    expect(receipts).toHaveLength(2);
    expect(receipts.every((receipt) => {
      const meta = receipt.metaJson as { businessDates?: unknown };
      return receipt.periodStart?.toISOString().slice(0, 10) === cutoffPeriod.from
        && receipt.periodEnd?.toISOString().slice(0, 10) === cutoffPeriod.to
        && JSON.stringify(meta.businessDates) === JSON.stringify(cutoffPeriod.businessDates);
    })).toBe(true);

    const publishedFacts = await prisma.channelAdListingProductMonthlyFact.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID, sourceImportRunId: attempt.attemptId },
    });
    const publishedCutoffFacts = publishedFacts.filter((fact) =>
      fact.month.toISOString().slice(0, 7) === cutoffPeriod.month);
    expect(publishedCutoffFacts.every((fact) =>
      fact.coveredStartDate.toISOString().slice(0, 10) === cutoffPeriod.from
      && fact.coveredEndDate.toISOString().slice(0, 10) === cutoffPeriod.to
      && fact.observedTargetDayCount === cutoffPeriod.businessDates.length
      && fact.allocatedSpend === 7n)).toBe(true);
  });

  it('uses the same slice clamp when a legacy monthly fact extends past collection coverage', async () => {
    const coverage = profitabilityCoverageForKstYesterday(new Date());
    const cutoffPeriod = coverage.periods.at(-1)!;
    const attempt = await owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: FIRST_KEY,
    });
    await uploadAllSlices(owner, attempt);
    await owner.finalizeAttempt(fence(attempt));

    const monthLastDay = new Date(Date.UTC(
      Number(cutoffPeriod.month.slice(0, 4)),
      Number(cutoffPeriod.month.slice(5, 7)),
      0,
    ));
    await prisma.channelAdListingProductMonthlyFact.updateMany({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceImportRunId: attempt.attemptId,
        month: new Date(`${cutoffPeriod.month}-01T00:00:00.000Z`),
      },
      data: {
        coveredEndDate: monthLastDay,
        observedTargetDayCount: monthLastDay.getUTCDate(),
      },
    });

    const generation = await owner.readGeneration({
      organizationId: TEST_ORGANIZATION_ID,
      sourceImportRunId: attempt.attemptId,
    });
    expect(generation?.allocations.filter((fact) => fact.month === cutoffPeriod.month))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          coveredStartDate: cutoffPeriod.from,
          coveredEndDate: cutoffPeriod.to,
          observedTargetDayCount: cutoffPeriod.businessDates.length,
        }),
      ]));
  });

  it('preserves the previous complete snapshot when the partial-cutoff attempt fails', async () => {
    const coverage = profitabilityCoverageForKstYesterday(new Date());
    const first = await owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: FIRST_KEY,
    });
    await uploadAllSlices(owner, first);
    await expect(owner.finalizeAttempt(fence(first))).resolves.toMatchObject({
      latestComplete: { sourceImportRunId: first.attemptId, coveredThrough: coverage.to },
      ready: true,
    });

    const failed = await owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: SECOND_KEY,
    });
    await expect(owner.failAttempt({
      ...fence(failed),
      code: 'PROVIDER_FAILED',
      message: 'provider unavailable',
    })).resolves.toMatchObject({
      latestAttempt: { attemptId: failed.attemptId, state: 'FAILED' },
      latestComplete: { sourceImportRunId: first.attemptId, coveredThrough: coverage.to },
      ready: true,
    });
  });

  it('holds an unreported closed day out of the confirmed coverage and its monthly facts', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      // 2026-09-07 12:00 KST: the import requests 2025-10-01 through 2026-09-06.
      vi.setSystemTime(new Date('2026-09-07T03:00:00.000Z'));
      const attempt = await owner.beginAttempt({
        organizationId: TEST_ORGANIZATION_ID,
        idempotencyKey: FIRST_KEY,
      });
      // Spend on 2026-09-05 and none on 2026-09-06: Coupang has not reported the 6th.
      for (const receipt of plannedUploads(attempt, (slice) =>
        slice.to === '2026-09-06' ? '2026-09-05' : slice.businessDates.at(-1)!)) {
        await owner.uploadSlice(receipt);
      }
      await expect(owner.finalizeAttempt(fence(attempt))).resolves.toMatchObject({
        latestComplete: { sourceImportRunId: attempt.attemptId, coveredThrough: '2026-09-05' },
        ready: true,
      });
      const september = await prisma.channelAdListingProductMonthlyFact.findMany({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          sourceImportRunId: attempt.attemptId,
          month: new Date('2026-09-01T00:00:00.000Z'),
        },
      });
      expect(september).toHaveLength(2);
      expect(september.every((fact) =>
        fact.coveredEndDate.toISOString().slice(0, 10) === '2026-09-05'
        && fact.observedTargetDayCount === 5
        && fact.allocatedSpend === 7n)).toBe(true);
      await expect(readMonthlyAdAllocationPublication(prisma as never, {
        organizationId: TEST_ORGANIZATION_ID,
        sourceImportRunId: attempt.attemptId,
      })).resolves.toMatchObject({ coveredThrough: '2026-09-05' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('drops a month whose only requested day is held as unreported', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      // 2026-09-02 12:00 KST: the import requests 2025-10-01 through 2026-09-01.
      vi.setSystemTime(new Date('2026-09-02T03:00:00.000Z'));
      const attempt = await owner.beginAttempt({
        organizationId: TEST_ORGANIZATION_ID,
        idempotencyKey: FIRST_KEY,
      });
      // Spend on 2026-08-31 and none on 2026-09-01.
      for (const receipt of plannedUploads(attempt, (slice) =>
        slice.from === '2026-09-01' ? null : slice.businessDates.at(-1)!)) {
        await owner.uploadSlice(receipt);
      }
      await expect(owner.finalizeAttempt(fence(attempt))).resolves.toMatchObject({
        latestComplete: { sourceImportRunId: attempt.attemptId, coveredThrough: '2026-08-31' },
        ready: true,
      });
      const run = await prisma.sourceImportRun.findUniqueOrThrow({ where: { id: attempt.attemptId } });
      expect(run.coverageEndDate).toEqual(new Date('2026-08-31T00:00:00.000Z'));
      expect(run.coveredMonths).not.toContain('2026-09');
      await expect(prisma.channelAdListingProductMonthlyFact.count({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          sourceImportRunId: attempt.attemptId,
          month: new Date('2026-09-01T00:00:00.000Z'),
        },
      })).resolves.toBe(0);
      const generation = await owner.readGeneration({
        organizationId: TEST_ORGANIZATION_ID,
        sourceImportRunId: attempt.attemptId,
      });
      expect(generation?.summary.coveredThrough).toBe('2026-08-31');
      expect(generation?.allocations.some((fact) => fact.month === '2026-09')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('holds the closed day while one account has not reported it, even when another has', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      // 2026-09-07 12:00 KST: the import requests 2025-10-01 through 2026-09-06.
      vi.setSystemTime(new Date('2026-09-07T03:00:00.000Z'));
      const attempt = await owner.beginAttempt({
        organizationId: TEST_ORGANIZATION_ID,
        idempotencyKey: FIRST_KEY,
      });
      // Account A reports spend on 2026-09-06. Account B spent on 2026-09-05 and shows none on the 6th yet.
      for (const receipt of plannedUploads(attempt, (slice, account) =>
        slice.to === '2026-09-06' && account.externalAccountId === 'account-b'
          ? '2026-09-05'
          : slice.businessDates.at(-1)!)) {
        await owner.uploadSlice(receipt);
      }
      await expect(owner.finalizeAttempt(fence(attempt))).resolves.toMatchObject({
        latestComplete: {
          sourceImportRunId: attempt.attemptId,
          coveredThrough: '2026-09-05',
          // Twelve months of 7 KRW for each account, less A's spend on the held day.
          qualitySummary: { providerSpendKrw: 161, allocatedSpendKrw: 161 },
        },
        ready: true,
      });
      const accountByExternalId = new Map((await prisma.channelAccount.findMany({
        where: { organizationId: TEST_ORGANIZATION_ID, channel: 'coupang' },
        select: { id: true, externalAccountId: true },
      })).map((account) => [account.externalAccountId, account.id]));
      const september = await prisma.channelAdListingProductMonthlyFact.findMany({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          sourceImportRunId: attempt.attemptId,
          month: new Date('2026-09-01T00:00:00.000Z'),
        },
      });
      expect(september.map((fact) => ({
        account: fact.channelAccountId === accountByExternalId.get('account-a') ? 'account-a' : 'account-b',
        coveredEndDate: fact.coveredEndDate.toISOString().slice(0, 10),
        observedTargetDayCount: fact.observedTargetDayCount,
        allocatedSpend: fact.allocatedSpend,
      })).sort((left, right) => left.account.localeCompare(right.account))).toEqual([
        // A's 2026-09-06 spend stays out of the published month with the day it was reported on.
        { account: 'account-a', coveredEndDate: '2026-09-05', observedTargetDayCount: 5, allocatedSpend: 0n },
        { account: 'account-b', coveredEndDate: '2026-09-05', observedTargetDayCount: 5, allocatedSpend: 7n },
      ]);
      await expect(readMonthlyAdAllocationPublication(prisma as never, {
        organizationId: TEST_ORGANIZATION_ID,
        sourceImportRunId: attempt.attemptId,
      })).resolves.toMatchObject({ coveredThrough: '2026-09-05' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('confirms the closed day when the account without spend on it was idle the day before too', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      // 2026-09-07 12:00 KST: the import requests 2025-10-01 through 2026-09-06.
      vi.setSystemTime(new Date('2026-09-07T03:00:00.000Z'));
      const attempt = await owner.beginAttempt({
        organizationId: TEST_ORGANIZATION_ID,
        idempotencyKey: FIRST_KEY,
      });
      // Account A reports spend on 2026-09-06. Account B last spent on 2026-09-01.
      for (const receipt of plannedUploads(attempt, (slice, account) =>
        slice.to === '2026-09-06' && account.externalAccountId === 'account-b'
          ? '2026-09-01'
          : slice.businessDates.at(-1)!)) {
        await owner.uploadSlice(receipt);
      }
      await expect(owner.finalizeAttempt(fence(attempt))).resolves.toMatchObject({
        latestComplete: { sourceImportRunId: attempt.attemptId, coveredThrough: '2026-09-06' },
        ready: true,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not expose a generation until every planned account and slice is complete', async () => {
    const attempt = await owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: FIRST_KEY,
    });
    await expect(owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: FIRST_KEY,
    })).resolves.toEqual(attempt);
    await expect(prisma.sourceImportRun.findUnique({
      where: { id: attempt.attemptId },
    })).resolves.toMatchObject({ status: 'running' });
    await expect(owner.readAttemptControl({
      organizationId: TEST_ORGANIZATION_ID,
      attemptId: attempt.attemptId,
    })).resolves.toMatchObject({
      attemptId: attempt.attemptId,
      attemptToken: attempt.attemptToken,
    });
    const receipts = plannedUploads(attempt);

    for (const receipt of receipts.slice(0, -1)) {
      await owner.uploadSlice(receipt);
    }

    await expect(owner.finalizeAttempt(fence(attempt))).rejects.toThrow(
      'ADVERTISING_IMPORT_INCOMPLETE',
    );
    await expect(owner.readSourceStatus({ organizationId: TEST_ORGANIZATION_ID })).resolves.toMatchObject({
      latestComplete: null,
      ready: false,
    });

    await owner.uploadSlice(receipts.at(-1)!);
    await expect(owner.finalizeAttempt(fence(attempt))).resolves.toMatchObject({
      latestComplete: { sourceImportRunId: attempt.attemptId, publicationSequence: '1' },
      ready: true,
    });
    await expect(owner.readAttemptControl({
      organizationId: TEST_ORGANIZATION_ID,
      attemptId: attempt.attemptId,
    })).rejects.toThrow('ATTEMPT_TERMINAL');
  });

  it('rechecks mapping generation after waiting for a concurrent mapping commit', async () => {
    const attempt = await owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: FIRST_KEY,
    });
    await uploadAllSlices(owner, attempt);
    let releaseMapping!: () => void;
    let mappingLocked!: () => void;
    const release = new Promise<void>((resolve) => { releaseMapping = resolve; });
    const locked = new Promise<void>((resolve) => { mappingLocked = resolve; });
    const mappingMutation = prisma.$transaction(async (tx) => {
      await lockProductMapping(tx, TEST_ORGANIZATION_ID);
      await tx.masterProductAbcFormulaState.upsert({
        where: { organizationId: TEST_ORGANIZATION_ID },
        create: { organizationId: TEST_ORGANIZATION_ID, mappingGeneration: 1n },
        update: { mappingGeneration: { increment: 1 } },
      });
      mappingLocked();
      await release;
    });
    await locked;

    const publication = owner.finalizeAttempt(fence(attempt)).then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );
    await waitForBlockedAdvisoryLock(prisma);
    releaseMapping();
    await mappingMutation;

    await expect(publication).resolves.toMatchObject({
      error: expect.objectContaining({ message: 'MAPPING_GENERATION_CHANGED' }),
    });
    await expect(prisma.sourceImportRun.findUnique({ where: { id: attempt.attemptId } }))
      .resolves.toMatchObject({ status: 'running' });
    await expect(owner.readSourceStatus({ organizationId: TEST_ORGANIZATION_ID }))
      .resolves.toMatchObject({ ready: false, latestComplete: null });
  });

  it('does not promote when a planned account advertiser identity drifts', async () => {
    const attempt = await owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: FIRST_KEY,
    });
    await uploadAllSlices(owner, attempt);
    const accountId = attempt.accounts.find((account) =>
      account.expectedAdvertiserId === 'ADVERTISER-A')!.channelAccountId;
    await prisma.channelAccount.updateMany({
      where: { id: accountId, organizationId: TEST_ORGANIZATION_ID },
      data: { vendorId: 'ADVERTISER-A-DRIFTED' },
    });

    await expect(owner.finalizeAttempt(fence(attempt))).rejects.toThrow(
      'ADVERTISING_ACCOUNT_IDENTITY_CHANGED',
    );
    await expect(prisma.sourceImportRun.findUnique({ where: { id: attempt.attemptId } }))
      .resolves.toMatchObject({ status: 'running' });
  });

  it('collects every retained Coupang account regardless of current status', async () => {
    await prisma.channelAccount.updateMany({
      where: { organizationId: TEST_ORGANIZATION_ID, channel: 'coupang' },
      data: { status: 'inactive' },
    });

    const attempt = await owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: FIRST_KEY,
    });

    expect(attempt.accounts.map((account) => account.externalAccountId).sort()).toEqual([
      'account-a',
      'account-b',
    ]);
    await uploadAllSlices(owner, attempt);
    await expect(owner.finalizeAttempt(fence(attempt))).resolves.toMatchObject({
      latestComplete: {
        sourceImportRunId: attempt.attemptId,
        qualitySummary: { plannedAccountCount: 2 },
      },
      ready: true,
    });
  });

  it('does not promote an empty plan after a new retained Coupang account appears', async () => {
    const attempt = await owner.beginAttempt({
      organizationId: OTHER_ORGANIZATION_ID,
      idempotencyKey: FIRST_KEY,
    });
    expect(attempt.accounts).toEqual([]);
    await prisma.channelAccount.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'New retained account',
        externalAccountId: 'new-account',
        vendorId: 'NEW-ADVERTISER',
        status: 'inactive',
      },
    });

    await expect(owner.finalizeAttempt({
      organizationId: OTHER_ORGANIZATION_ID,
      attemptId: attempt.attemptId,
      attemptToken: attempt.attemptToken,
    })).rejects.toThrow('ADVERTISING_ACCOUNT_SET_CHANGED');
    await expect(prisma.sourceImportRun.findUnique({ where: { id: attempt.attemptId } }))
      .resolves.toMatchObject({ status: 'running' });
  });

  it('publishes an explicit empty plan for an organization with no retained Coupang accounts', async () => {
    const attempt = await owner.beginAttempt({
      organizationId: OTHER_ORGANIZATION_ID,
      idempotencyKey: FIRST_KEY,
    });
    expect(attempt.accounts).toEqual([]);
    await expect(owner.finalizeAttempt({
      organizationId: OTHER_ORGANIZATION_ID,
      attemptId: attempt.attemptId,
      attemptToken: attempt.attemptToken,
    })).resolves.toMatchObject({
      latestComplete: {
        sourceImportRunId: attempt.attemptId,
        qualitySummary: {
          plannedAccountCount: 0,
          plannedSliceCount: 0,
          targetFactCount: 0,
          providerSpendKrw: 0,
          allocatedSpendKrw: 0,
        },
      },
      ready: true,
    });
    await expect(owner.readGeneration({
      organizationId: OTHER_ORGANIZATION_ID,
      sourceImportRunId: attempt.attemptId,
    })).resolves.toMatchObject({
      summary: { qualitySummary: { plannedAccountCount: 0 } },
      allocations: [],
    });
  });

  it('returns unavailable before collection when a retained account has no advertising identity', async () => {
    await prisma.channelAccount.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Uncollected account',
      },
    });

    await expect(owner.readSourceStatus({ organizationId: OTHER_ORGANIZATION_ID }))
      .resolves.toMatchObject({ latestAttempt: null, latestComplete: null, ready: false });
    await expect(owner.readSourceSnapshot({ organizationId: OTHER_ORGANIZATION_ID }))
      .resolves.toMatchObject({
        latestAttempt: null,
        latestComplete: null,
        completeGenerations: [],
        ready: false,
      });
  });

  it('withdraws an immutable empty generation after an identity-incomplete account appears', async () => {
    const attempt = await owner.beginAttempt({
      organizationId: OTHER_ORGANIZATION_ID,
      idempotencyKey: FIRST_KEY,
    });
    await owner.finalizeAttempt({
      organizationId: OTHER_ORGANIZATION_ID,
      attemptId: attempt.attemptId,
      attemptToken: attempt.attemptToken,
    });
    await prisma.channelAccount.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'New retained account',
        status: 'active',
      },
    });

    await expect(owner.readSourceStatus({ organizationId: OTHER_ORGANIZATION_ID }))
      .resolves.toMatchObject({ latestComplete: null, ready: false });
    await expect(owner.readSourceSnapshot({ organizationId: OTHER_ORGANIZATION_ID }))
      .resolves.toMatchObject({ latestComplete: null, completeGenerations: [], ready: false });
    await expect(owner.readGeneration({
      organizationId: OTHER_ORGANIZATION_ID,
      sourceImportRunId: attempt.attemptId,
    })).resolves.toBeNull();
    await expect(prisma.sourceImportRun.findUnique({ where: { id: attempt.attemptId } }))
      .resolves.toMatchObject({ status: 'completed', publicationSequence: 1n });
  });

  it('promotes once, conserves listing-day KRW, and replays one receipt as a no-op', async () => {
    const attempt = await owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: FIRST_KEY,
    });
    const receipts = plannedUploads(attempt);
    for (const receipt of receipts) await owner.uploadSlice(receipt);

    await expect(owner.uploadSlice(receipts[0]!)).resolves.toEqual({ replayed: true });
    const conflictingRow = { ...receipts[0]!.rows[0]!, adSpend: 8 };
    await expect(owner.uploadSlice({
      ...receipts[0]!,
      rows: [conflictingRow],
      checksum: canonicalProviderRowsChecksum([conflictingRow]),
    })).rejects.toThrow('RECEIPT_REPLAY_CONFLICT');

    await owner.finalizeAttempt(fence(attempt));
    const [providerSpend, allocatedSpend] = await Promise.all([
      prisma.channelAdTargetDailySnapshot.aggregate({
        _sum: { adSpend: true },
        where: { organizationId: TEST_ORGANIZATION_ID, sourceImportRunId: attempt.attemptId },
      }),
      prisma.channelAdListingProductMonthlyFact.aggregate({
        _sum: { allocatedSpend: true },
        where: { organizationId: TEST_ORGANIZATION_ID, sourceImportRunId: attempt.attemptId },
      }),
    ]);
    expect(allocatedSpend._sum.allocatedSpend).toBe(BigInt(providerSpend._sum.adSpend ?? 0));

    const generation = await owner.readGeneration({
      organizationId: TEST_ORGANIZATION_ID,
      sourceImportRunId: attempt.attemptId,
    });
    expect(generation).not.toBeNull();
    expect(Object.keys(generation!)).toEqual(['summary', 'allocations']);
    expect(generation).toMatchObject({
      summary: {
        sourceImportRunId: attempt.attemptId,
        frozenRecipePolicy: {
          version: 'WHOLE_RECIPE_QUANTITY_V1',
          allocation: 'INTEGER_KRW_LARGEST_REMAINDER',
          mappingGeneration: '0',
        },
      },
    });
    expect(generation).not.toHaveProperty('sourceImportRunProvenance');
    expect(generation).not.toHaveProperty('qualityReport');
  });

  it('preserves a monthly allocation whose total exceeds PostgreSQL INT4', async () => {
    const attempt = await owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: FIRST_KEY,
    });
    const receipts = plannedUploads(attempt);
    const largeReceipt = receipts.find((receipt) =>
      receipt.providerAdvertiserId === 'ADVERTISER-A'
      && receipt.sliceId.endsWith('2026-08-31'))!;
    const largeRows = attempt.accounts
      .find((account) => account.expectedAdvertiserId === 'ADVERTISER-A')!
      .slices.find((slice) => slice.sliceId === largeReceipt.sliceId)!
      .businessDates.map((businessDate) => ({
        businessDate,
        externalOptionId: 'AD-OPTION-A',
        adSpend: 2_147_483_647,
        impressions: 0,
        clicks: 0,
        orders: 0,
        conversions: 0,
        adRevenue: 0,
      }));
    const largeMonthlySpend = 2_147_483_647 * largeRows.length;
    const adjustedLargeReceipt = {
      ...largeReceipt,
      rows: largeRows,
      checksum: canonicalProviderRowsChecksum(largeRows),
      campaignCount: 1,
      expectedRowCount: largeRows.length,
      collectedRowCount: largeRows.length,
      responseBytes: largeRows.length * 128,
    };
    for (const receipt of receipts) {
      await owner.uploadSlice(receipt.sliceId === largeReceipt.sliceId
        ? adjustedLargeReceipt
        : receipt);
    }

    const generation = await owner.finalizeAttempt(fence(attempt));
    expect(generation.latestComplete?.qualitySummary).toMatchObject({
      providerSpendKrw: largeMonthlySpend + 161,
      allocatedSpendKrw: largeMonthlySpend + 161,
      unmatchedSpendKrw: 0,
      unallocatableSpendKrw: 0,
    });
  });

  it('rejects a receipt checksum that does not describe its canonical rows', async () => {
    const attempt = await owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: FIRST_KEY,
    });
    const receipt = plannedUploads(attempt)[0]!;

    await expect(owner.uploadSlice({
      ...receipt,
      checksum: '0'.repeat(64),
    })).rejects.toThrow('ADVERTISING_CHECKSUM_MISMATCH');
    await expect(prisma.channelAdTargetDailySnapshot.count({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceImportRunId: attempt.attemptId,
      },
    })).resolves.toBe(0);
  });

  it('requires a provider report completion proof for an empty upload', async () => {
    const attempt = await owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: FIRST_KEY,
    });
    const receipt = plannedUploads(attempt)[0]!;

    await expect(owner.uploadSlice({
      ...receipt,
      reportId: '',
      expectedRowCount: 0,
      collectedRowCount: 0,
      rows: [],
      checksum: canonicalProviderRowsChecksum([]),
    })).rejects.toThrow('INVALID_PROFITABILITY_REPORT_PROOF');
    await expect(prisma.channelAdTargetDailySnapshot.count({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceImportRunId: attempt.attemptId,
      },
    })).resolves.toBe(0);
  });

  it('publishes mapped rows with an unmapped positive-spend warning', async () => {
    const attempt = await owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: FIRST_KEY,
    });
    const receipts = plannedUploads(attempt);
    const first = receipts[0]!;
    const unknown = {
      ...first.rows[0]!,
      externalOptionId: 'UNKNOWN-OPTION',
      adSpend: 5,
    };
    const known = { ...first.rows[0]!, adSpend: 1 };
    await owner.uploadSlice({
      ...first,
      rows: [known, unknown],
      expectedRowCount: 2,
      collectedRowCount: 2,
      checksum: canonicalProviderRowsChecksum([known, unknown]),
    });
    for (const receipt of receipts.slice(1)) await owner.uploadSlice(receipt);

    await expect(owner.finalizeAttempt(fence(attempt))).resolves.toMatchObject({
      ready: true,
    });
    const generation = await owner.readGeneration({
      organizationId: TEST_ORGANIZATION_ID,
      sourceImportRunId: attempt.attemptId,
    });
    expect(generation?.allocations.some((allocation) => allocation.allocatedSpend === 1)).toBe(true);
    expect(generation?.allocations.some((allocation) => allocation.allocatedSpend === 5)).toBe(false);
    expect(generation?.summary.qualitySummary).toMatchObject({
      unmatchedTargetCount: 1,
      unmatchedSpendKrw: 5,
      providerSpendKrw: 167,
      allocatedSpendKrw: 162,
    });
  });

  it('publishes active-account rows when the frozen recipe is incomplete and preserves unallocatable spend', async () => {
    await seedAccount(prisma, TEST_ORGANIZATION_ID, 'account-c', 'ADVERTISER-C', 'C', 0);
    const attempt = await owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: FIRST_KEY,
    });
    const receipts = plannedUploads(attempt);
    const incompleteRecipeReceipts = receipts.filter((receipt) =>
      receipt.providerAdvertiserId === 'ADVERTISER-C');
    expect(incompleteRecipeReceipts).toHaveLength(12);
    for (const receipt of receipts) await owner.uploadSlice(receipt);

    await expect(owner.finalizeAttempt(fence(attempt))).resolves.toMatchObject({
      ready: true,
    });
    const generation = await owner.readGeneration({
      organizationId: TEST_ORGANIZATION_ID,
      sourceImportRunId: attempt.attemptId,
    });
    const incompleteRecipeAccountId = attempt.accounts.find((account) =>
      account.externalAccountId === 'account-c')!.channelAccountId;
    expect(generation?.allocations.some((allocation) => allocation.channelAccountId ===
      incompleteRecipeAccountId)).toBe(false);
    expect(generation?.summary.qualitySummary).toMatchObject({
      unmatchedTargetCount: 0,
      unmatchedSpendKrw: 0,
      unallocatableTargetCount: 1,
      unallocatableSpendKrw: 1,
      providerSpendKrw: 169,
      allocatedSpendKrw: 168,
    });
  });

  it('keeps the prior COMPLETE generation current when Alert resolution rolls back publication', async () => {
    const first = await owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: FIRST_KEY,
    });
    for (const receipt of plannedUploads(first)) await owner.uploadSlice(receipt);
    await owner.finalizeAttempt(fence(first));

    const replacement = await owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: SECOND_KEY,
    });
    for (const receipt of plannedUploads(replacement)) await owner.uploadSlice(receipt);

    const failingAlerts = new SourceFailureAlerts(prisma as never);
    failingAlerts.resolveSourceFailure = async () => {
      throw new Error('alert write failed');
    };
    const failingOwner = new ProfitabilityAdImportRepositoryAdapter(
      prisma as never,
      failingAlerts,
    );

    await expect(failingOwner.finalizeAttempt(fence(replacement))).rejects.toThrow(
      'alert write failed',
    );
    await expect(prisma.sourceImportRun.findUnique({ where: { id: replacement.attemptId } }))
      .resolves.toMatchObject({ status: 'running' });
    await expect(owner.readSourceStatus({ organizationId: TEST_ORGANIZATION_ID })).resolves.toMatchObject({
      latestComplete: { sourceImportRunId: first.attemptId },
      latestAttempt: { attemptId: replacement.attemptId, state: 'RUNNING' },
      ready: true,
    });
  });

  it('terminalizes an expired attempt and alerts before creating the next attempt', async () => {
    const expired = await owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: FIRST_KEY,
    });
    await prisma.sourceImportRun.updateMany({
      where: { id: expired.attemptId, organizationId: TEST_ORGANIZATION_ID },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    const replacement = await owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: SECOND_KEY,
    });
    expect(replacement.attemptId).not.toBe(expired.attemptId);
    await expect(prisma.sourceImportRun.findUnique({ where: { id: expired.attemptId } }))
      .resolves.toMatchObject({ status: 'failed', errorCode: 'ATTEMPT_EXPIRED' });
    const alert = await prisma.alert.findFirst({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        dedupeKey: 'source:coupang-ad-profitability',
      },
    });
    expect(alert).toMatchObject({
      attemptId: expired.attemptId,
      status: 'OPEN',
      message: '광고 수익성 수집이 결과를 저장하기 전에 만료되었습니다. 다시 수집해주세요.',
    });
    // The code travels in the attempt's `errorCode`; the line the operator reads is a sentence.
    expect(alert?.message).not.toMatch(/^[A-Z][A-Z0-9_]+:/);
  });

  it('replays complete and failed terminal commands idempotently', async () => {
    const complete = await owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: FIRST_KEY,
    });
    await uploadAllSlices(owner, complete);
    const firstComplete = await owner.finalizeAttempt(fence(complete));
    await expect(owner.finalizeAttempt(fence(complete))).resolves.toEqual(firstComplete);

    const failed = await owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: SECOND_KEY,
    });
    const failure = {
      ...fence(failed),
      code: 'PROVIDER_FAILED',
      message: 'provider unavailable',
    };
    const firstFailure = await owner.failAttempt(failure);
    await expect(owner.failAttempt(failure)).resolves.toEqual(firstFailure);
  });

  it('fences exact reads and writes by organization', async () => {
    const attempt = await owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: FIRST_KEY,
    });
    await expect(owner.readAttemptControl({
      organizationId: OTHER_ORGANIZATION_ID,
      attemptId: attempt.attemptId,
    })).resolves.toBeNull();
    await expect(owner.readGeneration({
      organizationId: OTHER_ORGANIZATION_ID,
      sourceImportRunId: attempt.attemptId,
    })).resolves.toBeNull();
    await expect(owner.uploadSlice({
      ...plannedUploads(attempt)[0]!,
      organizationId: OTHER_ORGANIZATION_ID,
    })).rejects.toThrow('SOURCE_ATTEMPT_NOT_FOUND');
  });

  it('derives Alert actionability from the bounded failure code', async () => {
    const cancelled = await owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: FIRST_KEY,
    });
    await owner.failAttempt({
      ...fence(cancelled),
      code: 'COLLECTION_CANCELLED',
      message: 'operator cancelled',
    });
    await expect(prisma.alert.count({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        dedupeKey: 'source:coupang-ad-profitability',
      },
    })).resolves.toBe(0);

    const failed = await owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: SECOND_KEY,
    });
    await owner.failAttempt({
      ...fence(failed),
      code: 'PROVIDER_FAILED',
      message: 'provider unavailable',
    });
    await expect(prisma.alert.count({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        dedupeKey: 'source:coupang-ad-profitability',
      },
    })).resolves.toBe(1);
  });
});

function createOwner(prisma: PrismaClient): ProfitabilityAdImportRepositoryAdapter {
  return new ProfitabilityAdImportRepositoryAdapter(
    prisma as never,
    new SourceFailureAlerts(prisma as never),
  );
}

async function uploadAllSlices(
  owner: ProfitabilityAdImportRepositoryAdapter,
  plan: AdvertisingProfitabilityPlan,
): Promise<void> {
  for (const receipt of plannedUploads(plan)) await owner.uploadSlice(receipt);
}

async function seedAccount(
  prisma: PrismaClient,
  organizationId: string,
  externalAccountId: string,
  vendorId: string,
  suffix: string,
  quantity = 1,
): Promise<void> {
  const account = await prisma.channelAccount.create({
    data: {
      organizationId,
      channel: 'coupang',
      name: `Advertising ${suffix}`,
      externalAccountId,
      vendorId,
      isPrimary: suffix === 'A',
    },
  });
  const master = await prisma.masterProduct.create({
    data: {
      organizationId,
      code: `AD-MASTER-${suffix}`,
      name: `Advertising master ${suffix}`,
    },
  });
  const sku = await prisma.sellpiaInventorySku.create({
    data: {
      organizationId,
      masterProductId: master.id,
      code: `AD-SKU-${suffix}`,
      name: `Advertising SKU ${suffix}`,
      optionName: `Option ${suffix}`,
      currentStock: 100,
      purchasePrice: 100,
    },
  });
  const listing = await prisma.channelListing.create({
    data: {
      organizationId,
      channelAccountId: account.id,
      externalId: `AD-LISTING-${suffix}`,
      masterProductId: master.id,
      isActive: true,
    },
  });
  const option = await prisma.channelListingOption.create({
    data: {
      organizationId,
      listingId: listing.id,
      externalOptionId: `AD-OPTION-${suffix}`,
      isActive: true,
    },
  });
  await prisma.channelListingOptionInventoryComponent.create({
    data: {
      organizationId,
      channelListingOptionId: option.id,
      sellpiaInventorySkuId: sku.id,
      quantity,
    },
  });
}

/**
 * One receipt per planned slice. Its row falls on `rowDate(slice)`, the slice's
 * last requested day by default so the closed day carries spend; `null`
 * uploads the slice with no rows.
 */
function plannedUploads(
  plan: AdvertisingProfitabilityPlan,
  rowDate: (
    slice: AdvertisingProfitabilityPlan['accounts'][number]['slices'][number],
    account: AdvertisingProfitabilityPlan['accounts'][number],
  ) => string | null = (slice) => slice.businessDates.at(-1)!,
): AdvertisingProfitabilitySliceUpload[] {
  let sequence = 0;
  return plan.accounts.flatMap((account) => account.slices.map((slice) => {
    const isFirstSlice = slice.sliceId === account.slices[0]?.sliceId;
    const row = {
      businessDate: rowDate(slice, account) ?? slice.businessDates.at(-1)!,
      externalOptionId: account.externalAccountId === 'account-a'
        ? 'AD-OPTION-A'
        : account.externalAccountId === 'account-b'
          ? 'AD-OPTION-B'
          : 'AD-OPTION-C',
      adSpend: account.externalAccountId === 'account-c'
        ? isFirstSlice ? 1 : 0
        : 7,
      impressions: 10,
      clicks: 2,
      orders: 1,
      conversions: 1,
      adRevenue: 70,
    };
    const rows = (account.externalAccountId === 'account-c' && !isFirstSlice) || rowDate(slice, account) === null
      ? []
      : [row];
    return {
      organizationId: TEST_ORGANIZATION_ID,
      attemptId: plan.attemptId,
      attemptToken: plan.attemptToken,
      sliceId: slice.sliceId,
      sequence: sequence++,
      checksum: canonicalProviderRowsChecksum(rows),
      providerAdvertiserId: account.expectedAdvertiserId,
      reportId: `REPORT-${account.externalAccountId}-${slice.sliceId}`,
      campaignCount: rows.length === 0 ? 0 : 1,
      expectedRowCount: rows.length,
      collectedRowCount: rows.length,
      responseBytes: rows.length === 0 ? 1 : 128,
      rows,
    };
  }));
}

function fence(plan: AdvertisingProfitabilityPlan) {
  return {
    organizationId: TEST_ORGANIZATION_ID,
    attemptId: plan.attemptId,
    attemptToken: plan.attemptToken,
  };
}

async function waitForBlockedAdvisoryLock(prisma: PrismaClient): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const [row] = await prisma.$queryRaw<Array<{ waiting: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_locks
        WHERE locktype = 'advisory' AND granted = false
      ) AS waiting
    `;
    if (row?.waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for the publication mapping lock');
}
