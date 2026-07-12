import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { normalizeOperationalChannelAccounts } from '../../../../scripts/data-migrations/v0.1.8/001_normalize_operational_channel_accounts';
import { normalizePromotedCandidateStatus } from '../../../../scripts/data-migrations/v0.1.8/003_normalize_promoted_candidate_status';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from './real-prisma';

const CANONICAL_ACCOUNT_ID = '10000000-0000-4000-8000-000000000001';
const DUPLICATE_ACCOUNT_ID = '10000000-0000-4000-8000-000000000002';

describe.sequential('v0.1.8 data migrations', () => {
  let prisma: PrismaClient;

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

  it('merges terminal duplicate-account import histories, repoints consumers, and reruns idempotently', async () => {
    await seedExactDuplicateAccounts(prisma);
    const failedRun = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: CANONICAL_ACCOUNT_ID,
        sourceType: 'coupang_wing_catalog',
        fileName: 'older-failed.xlsx',
        fileHash: 'same-terminal-history',
        status: 'failed',
        rowCount: 1,
        publicationSequence: 4n,
        createdBy: TEST_USER_ID,
      },
    });
    const completedAt = new Date('2026-07-12T12:00:00.000Z');
    const completedRun = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: DUPLICATE_ACCOUNT_ID,
        sourceType: 'coupang_wing_catalog',
        fileName: 'completed.xlsx',
        fileHash: 'same-terminal-history',
        status: 'completed',
        rowCount: 22,
        publicationSequence: 5n,
        importedAt: completedAt,
        createdBy: TEST_USER_ID,
      },
    });
    const inventorySku = await prisma.inventorySku.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sellpiaProductCode: 'MIGRATION-SP-1',
        name: 'Inventory consumer',
        currentStock: 1,
        lastImportRunId: failedRun.id,
      },
    });
    const master = await prisma.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'M-MIGRATION-1',
        name: 'Master consumer',
        lastImportRunId: failedRun.id,
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: DUPLICATE_ACCOUNT_ID,
        channel: 'coupang',
        externalId: 'MIGRATION-PRODUCT-1',
        lastImportRunId: failedRun.id,
      },
    });
    const listingOption = await prisma.channelListingOption.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: DUPLICATE_ACCOUNT_ID,
        listingId: listing.id,
        externalOptionId: 'MIGRATION-SKU-1',
        lastImportRunId: failedRun.id,
      },
    });

    const first = await prisma.$transaction((tx) => normalizeOperationalChannelAccounts.run(tx));

    const [accounts, runs, persistedInventory, persistedMaster, persistedListing, persistedOption] =
      await Promise.all([
        prisma.channelAccount.findMany({
          where: { organizationId: TEST_ORGANIZATION_ID },
          orderBy: { id: 'asc' },
        }),
        prisma.sourceImportRun.findMany({
          where: { organizationId: TEST_ORGANIZATION_ID },
          orderBy: { id: 'asc' },
        }),
        prisma.inventorySku.findUniqueOrThrow({ where: { id: inventorySku.id } }),
        prisma.masterProduct.findUniqueOrThrow({ where: { id: master.id } }),
        prisma.channelListing.findUniqueOrThrow({ where: { id: listing.id } }),
        prisma.channelListingOption.findUniqueOrThrow({ where: { id: listingOption.id } }),
      ]);

    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({
      id: CANONICAL_ACCOUNT_ID,
      externalAccountId: 'shared-seller',
    });
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      id: completedRun.id,
      channelAccountId: CANONICAL_ACCOUNT_ID,
      fileName: 'completed.xlsx',
      fileHash: 'same-terminal-history',
      status: 'completed',
      rowCount: 22,
      importedAt: completedAt,
      publicationSequence: 5n,
      attemptToken: completedRun.attemptToken,
    });
    expect([
      persistedInventory.lastImportRunId,
      persistedMaster.lastImportRunId,
      persistedListing.lastImportRunId,
      persistedOption.lastImportRunId,
    ]).toEqual(Array(4).fill(completedRun.id));
    expect(persistedListing.channelAccountId).toBe(CANONICAL_ACCOUNT_ID);
    expect(persistedOption.channelAccountId).toBe(CANONICAL_ACCOUNT_ID);
    expect(first.details).toMatchObject({ mergedSourceImportRuns: 1 });

    const snapshot = JSON.stringify({ accounts, runs }, bigintJsonReplacer);
    const second = await prisma.$transaction((tx) => normalizeOperationalChannelAccounts.run(tx));
    const rerunSnapshot = JSON.stringify({
      accounts: await prisma.channelAccount.findMany({
        where: { organizationId: TEST_ORGANIZATION_ID },
        orderBy: { id: 'asc' },
      }),
      runs: await prisma.sourceImportRun.findMany({
        where: { organizationId: TEST_ORGANIZATION_ID },
        orderBy: { id: 'asc' },
      }),
    }, bigintJsonReplacer);

    expect(second.details).toMatchObject({ mergedSourceImportRuns: 0 });
    expect(rerunSnapshot).toBe(snapshot);
  });

  it('blocks a running duplicate-account import collision before persistent mutation', async () => {
    await seedExactDuplicateAccounts(prisma);
    const terminal = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: CANONICAL_ACCOUNT_ID,
        sourceType: 'coupang_wing_catalog',
        fileName: 'terminal.xlsx',
        fileHash: 'running-collision',
        status: 'failed',
      },
    });
    const running = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: DUPLICATE_ACCOUNT_ID,
        sourceType: 'coupang_wing_catalog',
        fileName: 'running.xlsx',
        fileHash: 'running-collision',
        status: 'running',
      },
    });

    await expect(
      prisma.$transaction((tx) => normalizeOperationalChannelAccounts.run(tx)),
    ).rejects.toThrow(/running SourceImportRun collision/i);

    expect(await prisma.channelAccount.count({
      where: { id: { in: [CANONICAL_ACCOUNT_ID, DUPLICATE_ACCOUNT_ID] } },
    })).toBe(2);
    expect(await prisma.sourceImportRun.findMany({
      where: { id: { in: [terminal.id, running.id] } },
      orderBy: { id: 'asc' },
      select: { id: true, channelAccountId: true, status: true },
    })).toEqual([
      { id: terminal.id, channelAccountId: CANONICAL_ACCOUNT_ID, status: 'failed' },
      { id: running.id, channelAccountId: DUPLICATE_ACCOUNT_ID, status: 'running' },
    ].sort((left, right) => left.id.localeCompare(right.id)));
  });

  it('archives only legacy accountless product_registered preparations and frees the active slot', async () => {
    const account = await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Registration account',
        externalAccountId: 'registration-account',
      },
    });
    const candidates = await Promise.all(
      ['legacy', 'draft-control', 'account-control', 'deleted-control'].map((suffix) =>
        prisma.sourcingCandidate.create({
          data: {
            organizationId: TEST_ORGANIZATION_ID,
            sourceUrl: `https://example.test/${suffix}`,
            sourcePlatform: 'ALIBABA_1688',
            rawData: {},
            name: suffix,
            status: 'promoted',
          },
        })),
    );
    const [legacyCandidate, draftCandidate, accountCandidate, deletedCandidate] = candidates;
    const legacy = await prisma.productPreparation.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceCandidateId: legacyCandidate.id,
        displayName: 'Legacy terminal selection',
        status: 'product_registered',
        isCurrentForMaster: true,
        selectedThumbnailUrl: 'https://cdn.example.test/legacy.png',
        registrationInput: { salePrice: 12345, memo: 'preserve-me' },
        submissionKey: 'legacy-submission-key',
      },
    });
    const draftControl = await prisma.productPreparation.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceCandidateId: draftCandidate.id,
        displayName: 'Draft control',
        status: 'draft',
      },
    });
    const accountControl = await prisma.productPreparation.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceCandidateId: accountCandidate.id,
        channelAccountId: account.id,
        displayName: 'Account terminal control',
        status: 'product_registered',
      },
    });
    const deletedAt = new Date('2026-07-01T00:00:00.000Z');
    const deletedControl = await prisma.productPreparation.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceCandidateId: deletedCandidate.id,
        displayName: 'Deleted control',
        status: 'product_registered',
        isDeleted: true,
        deletedAt,
      },
    });

    const first = await prisma.$transaction((tx) => normalizePromotedCandidateStatus.run(tx));
    const archived = await prisma.productPreparation.findUniqueOrThrow({ where: { id: legacy.id } });

    expect(first).toMatchObject({
      affectedRows: 5,
      details: {
        normalizedPromotedCandidates: 4,
        archivedLegacyProductPreparations: 1,
      },
    });
    expect(archived).toMatchObject({
      status: 'cancelled',
      isDeleted: true,
      isCurrentForMaster: false,
      selectedThumbnailUrl: 'https://cdn.example.test/legacy.png',
      registrationInput: { salePrice: 12345, memo: 'preserve-me' },
      submissionKey: 'legacy-submission-key',
    });
    expect(archived.deletedAt).toBeInstanceOf(Date);
    expect(await prisma.productPreparation.findUniqueOrThrow({ where: { id: draftControl.id } }))
      .toMatchObject({ status: 'draft', isDeleted: false });
    expect(await prisma.productPreparation.findUniqueOrThrow({ where: { id: accountControl.id } }))
      .toMatchObject({ status: 'product_registered', isDeleted: false });
    expect(await prisma.productPreparation.findUniqueOrThrow({ where: { id: deletedControl.id } }))
      .toMatchObject({ status: 'product_registered', isDeleted: true, deletedAt });

    await expect(prisma.productPreparation.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceCandidateId: legacyCandidate.id,
        channelAccountId: account.id,
        displayName: 'New account draft',
        status: 'draft',
      },
    })).resolves.toMatchObject({ status: 'draft', isDeleted: false });

    const archivedUpdatedAt = archived.updatedAt;
    const second = await prisma.$transaction((tx) => normalizePromotedCandidateStatus.run(tx));
    expect(second).toEqual({
      affectedRows: 0,
      details: {
        normalizedPromotedCandidates: 0,
        archivedLegacyProductPreparations: 0,
      },
    });
    expect((await prisma.productPreparation.findUniqueOrThrow({ where: { id: legacy.id } })).updatedAt)
      .toEqual(archivedUpdatedAt);
  });
});

async function seedExactDuplicateAccounts(prisma: PrismaClient): Promise<void> {
  await prisma.channelAccount.createMany({
    data: [
      {
        id: CANONICAL_ACCOUNT_ID,
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Shared Wing account',
        sellerId: 'shared-seller',
        status: 'active',
        isPrimary: true,
      },
      {
        id: DUPLICATE_ACCOUNT_ID,
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Shared Wing account',
        sellerId: 'shared-seller',
        status: 'active',
        isPrimary: false,
      },
    ],
  });
}

function bigintJsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}
