import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service';
import { ownerTransaction } from '../../prisma/owner-transaction';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { ChannelAccountPersistenceAdapter } from '../adapter/out/persistence/channel-account.persistence.adapter';
import { ChannelsProductMappingGenerationAdapter } from "../adapter/out/products/product-mapping-generation.adapter";
import { ProductMappingGenerationRepositoryAdapter } from "../../products/adapter/out/persistence/product-mapping-generation.repository.adapter";

describe('ChannelAccountPersistenceAdapter mapping generation (PG integration)', () => {
  let prisma: PrismaClient;
  let repository: ChannelAccountPersistenceAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    repository = new ChannelAccountPersistenceAdapter(
      prisma as unknown as PrismaService,
    new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter()),
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('advances once for active Coupang account identity changes and isolates organizations', async () => {
    await repository.upsertCoupangSettings(TEST_ORGANIZATION_ID, settings('A00000001'));
    await expect(mappingGeneration()).resolves.toBe(1n);

    await repository.upsertCoupangSettings(TEST_ORGANIZATION_ID, settings('A00000001', 'rotated'));
    await expect(mappingGeneration()).resolves.toBe(1n);

    await repository.upsertCoupangSettings(TEST_ORGANIZATION_ID, settings('B00000002'));
    await expect(mappingGeneration()).resolves.toBe(2n);

    const accountB = await prisma.channelAccount.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        vendorId: 'B00000002',
      },
      select: { id: true },
    });
    await prisma.channelAccount.update({
      where: { id: accountB.id },
      data: { status: 'paused' },
    });
    await repository.upsertCoupangSettings(TEST_ORGANIZATION_ID, settings('B00000002', 'reactivated'));
    await expect(mappingGeneration()).resolves.toBe(3n);
    await expect(prisma.masterProductAbcFormulaState.findUnique({
      where: { organizationId: OTHER_ORGANIZATION_ID },
      select: { mappingGeneration: true },
    })).resolves.toBeNull();
  });

  it('does not advance for a primary-account-only change', async () => {
    await repository.upsertCoupangSettings(TEST_ORGANIZATION_ID, settings('A00000001'));
    await repository.upsertCoupangSettings(TEST_ORGANIZATION_ID, settings('B00000002'));
    await expect(mappingGeneration()).resolves.toBe(2n);

    await prisma.channelAccount.updateMany({
      where: { organizationId: TEST_ORGANIZATION_ID, channel: 'coupang' },
      data: { isPrimary: false },
    });
    await repository.upsertCoupangSettings(TEST_ORGANIZATION_ID, settings('B00000002', 'primary-only'));
    await expect(mappingGeneration()).resolves.toBe(2n);
  });

  it('lists configured mall accounts alongside active marketplace accounts, and leaves paused ones out (KID-330)', async () => {
    for (const [channel, status] of [['coupang', 'active'], ['kidsnote', 'configured'], ['onch', 'paused']] as const) {
      await prisma.channelAccount.create({
        data: { organizationId: TEST_ORGANIZATION_ID, channel, name: `${channel} account`, status },
      });
    }
    const listed = await repository.listActive(TEST_ORGANIZATION_ID);
    expect(listed.map((account) => account.channel).sort()).toEqual(['coupang', 'kidsnote']);
  });

  it.each(['coupang', 'rocket'] as const)(
    'advances once when a %s account claims its provider identity — mapping generation is channel-neutral',
    async (channel) => {
      const account = await prisma.channelAccount.create({
        data: { organizationId: TEST_ORGANIZATION_ID, channel, name: `${channel} account`, status: 'active' },
        select: { id: true },
      });
      const before = await mappingGeneration();

      await prisma.$transaction((tx) => repository.claimProviderIdentity(ownerTransaction(tx), {
        organizationId: TEST_ORGANIZATION_ID,
        accountId: account.id,
        channel,
        expectedVendorId: null,
        vendorId: 'V00000001',
      }));
      await expect(mappingGeneration()).resolves.toBe(before + 1n);

      await prisma.$transaction((tx) => repository.claimProviderIdentity(ownerTransaction(tx), {
        organizationId: TEST_ORGANIZATION_ID,
        accountId: account.id,
        channel,
        expectedVendorId: 'V00000001',
        vendorId: 'V00000001',
      }));
      await expect(mappingGeneration()).resolves.toBe(before + 1n);
    },
  );

  function settings(vendorId: string, _suffix = 'initial') {
    return { vendorId };
  }

  async function mappingGeneration(): Promise<bigint> {
    const state = await prisma.masterProductAbcFormulaState.findUnique({
      where: { organizationId: TEST_ORGANIZATION_ID },
      select: { mappingGeneration: true },
    });
    return state?.mappingGeneration ?? 0n;
  }
});
