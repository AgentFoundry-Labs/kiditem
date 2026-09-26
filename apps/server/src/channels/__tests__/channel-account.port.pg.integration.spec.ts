import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { ChannelAccountPersistenceAdapter } from '../adapter/out/persistence/channel-account.persistence.adapter';
import { ChannelCredentialsAdapter } from '../adapter/out/credentials/channel-credentials.adapter';
import { ChannelAccountService } from '../application/service/account/channel-account.service';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { ChannelAccountPort } from '../application/port/in/account/channel-account.port';
import { ownerTransaction } from '../../prisma/owner-transaction';
import { ChannelsProductMappingGenerationAdapter } from "../adapter/out/products/product-mapping-generation.adapter";
import { ProductMappingGenerationRepositoryAdapter } from "../../products/adapter/out/persistence/product-mapping-generation.repository.adapter";

describe('ChannelAccountPort + disposable Postgres', () => {
  let prisma: PrismaClient;
  let port: ChannelAccountPort;
  const previousEncryptionKey = process.env.CHANNEL_CREDENTIALS_ENCRYPTION_KEY;

  beforeAll(async () => {
    process.env.CHANNEL_CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 13).toString('base64');
    prisma = makeTestPrisma();
    await prisma.$connect();
    const persistence = new ChannelAccountPersistenceAdapter(prisma as unknown as PrismaService, new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter()));
    port = new ChannelAccountService(
      persistence,
      new ChannelCredentialsAdapter(),
      () => new Date('2026-09-01T00:00:00.000Z'),
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    if (previousEncryptionKey === undefined) delete process.env.CHANNEL_CREDENTIALS_ENCRYPTION_KEY;
    else process.env.CHANNEL_CREDENTIALS_ENCRYPTION_KEY = previousEncryptionKey;
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('isolates organizations and preserves credentials, sibling config, and partial reorder updates', async () => {
    await prisma.channelAccount.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        channel: 'onch',
        name: 'Other OnChannel',
        externalAccountId: 'onch',
        status: 'configured',
        config: { orderCollection: { loginId: 'OTHER_ORG_SECRET' } },
      },
    });
    await createMallAccount('onch', {
      rootExtension: 'keep-root',
      orderCollection: { extension: 'keep-nested', sortOrder: 6 },
    });
    await createMallAccount('art09', {
      orderCollection: { sortOrder: 7 },
    });

    const listed = await port.list(TEST_ORGANIZATION_ID);
    expect(listed.find((account) => account.key === 'onch')).toMatchObject({
      loginId: null,
      hasPassword: false,
    });
    expect(JSON.stringify(listed)).not.toContain('OTHER_ORG_SECRET');

    await Promise.all([
      port.update(TEST_ORGANIZATION_ID, 'onch', {
        loginId: ' merchant-id ',
        password: ' preserved-password ',
        memo: ' updated memo ',
      }),
      port.reorder(TEST_ORGANIZATION_ID, ['onch']),
    ]);
    await port.update(TEST_ORGANIZATION_ID, 'onch', {
      loginId: 'merchant-id',
      memo: 'updated memo',
      password: '   ',
    });

    const account = await prisma.channelAccount.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, channel: 'onch', externalAccountId: 'onch' },
    });
    const config = account.config as {
      rootExtension?: string;
      orderCollection?: Record<string, unknown>;
    };
    expect(config.rootExtension).toBe('keep-root');
    expect(config.orderCollection).toMatchObject({
      extension: 'keep-nested',
      loginId: 'merchant-id',
      memo: 'updated memo',
      sortOrder: 0,
      passwordUpdatedAt: '2026-09-01T00:00:00.000Z',
    });
    expect(await port.getPassword(TEST_ORGANIZATION_ID, 'onch')).toEqual({
      key: 'onch',
      loginId: 'merchant-id',
      supplierLoginId: null,
      password: 'preserved-password',
    });
    expect(JSON.stringify(await port.list(TEST_ORGANIZATION_ID))).not.toContain('preserved-password');
    const art09 = await prisma.channelAccount.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, channel: 'art09', externalAccountId: 'art09' },
    });
    expect((art09.config as { orderCollection: { sortOrder: number | null } }).orderCollection.sortOrder)
      .toBeNull();
    await expect(prisma.channelAccount.count({
      where: { organizationId: OTHER_ORGANIZATION_ID, channel: 'onch' },
    })).resolves.toBe(1);
  });

  it('stores and reads the Wing login on the organization primary Wing row only, never in the mall list (KID-377)', async () => {
    await expect(port.update(TEST_ORGANIZATION_ID, 'coupang', { loginId: 'wing-id', password: 'wing-secret' }))
      .rejects.toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'SHARED_CHANNEL_ACCOUNT_MISSING' } });
    await prisma.channelAccount.create({
      data: { organizationId: OTHER_ORGANIZATION_ID, channel: 'coupang', name: 'Other Wing', externalAccountId: 'B00000009', vendorId: 'B00000009', status: 'active', isPrimary: true,
        config: { orderCollection: { loginId: 'OTHER_ORG_WING' } } },
    });
    await prisma.channelAccount.create({
      data: { organizationId: TEST_ORGANIZATION_ID, channel: 'coupang', name: 'Wing Second', externalAccountId: 'A00000002', vendorId: 'A00000002', status: 'active', isPrimary: false },
    });
    const primary = await prisma.channelAccount.create({
      data: { organizationId: TEST_ORGANIZATION_ID, channel: 'coupang', name: 'Wing Primary', externalAccountId: 'A00000001', vendorId: 'A00000001', status: 'active', isPrimary: true,
        config: { rootExtension: 'keep-me' } },
    });

    await port.update(TEST_ORGANIZATION_ID, 'coupang', { loginId: ' wing-id ', password: ' wing-secret ' });

    expect(await port.getPassword(TEST_ORGANIZATION_ID, 'coupang')).toEqual({ key: 'coupang', loginId: 'wing-id', supplierLoginId: null, password: 'wing-secret' });
    const saved = await prisma.channelAccount.findUniqueOrThrow({ where: { id: primary.id } });
    expect(saved).toMatchObject({ name: 'Wing Primary', status: 'active' });
    expect(saved.config).toMatchObject({ rootExtension: 'keep-me', orderCollection: { loginId: 'wing-id' } });
    await expect(prisma.channelAccount.count({ where: { organizationId: TEST_ORGANIZATION_ID, channel: 'coupang' } })).resolves.toBe(2);
    const listed = await port.list(TEST_ORGANIZATION_ID);
    expect(listed.map((account) => account.key)).not.toContain('coupang');
    expect(JSON.stringify(listed)).not.toMatch(/wing-secret|OTHER_ORG_WING/);
  });

  it('does not create a shared Rocket row during mall login updates or reactivate a paused row', async () => {
    await expect(port.update(TEST_ORGANIZATION_ID, 'coupang-direct', {
      loginId: 'supplier-login',
    })).rejects.toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'SHARED_CHANNEL_ACCOUNT_MISSING' }, message: expect.stringContaining('채널 계정을 먼저 연결하세요') });
    await expect(prisma.channelAccount.count({ where: { organizationId: TEST_ORGANIZATION_ID } }))
      .resolves.toBe(0);

    await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Coupang Wing',
        externalAccountId: 'A00000001',
        vendorId: 'A00000001',
        status: 'active',
        isPrimary: true,
      },
    });
    const rocket = await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'rocket',
        name: 'Rocket Paused By User',
        externalAccountId: 'A00000001',
        vendorId: 'A00000001',
        status: 'paused',
        config: { rootExtension: 'keep-me' },
      },
    });

    await port.update(TEST_ORGANIZATION_ID, 'coupang-direct', {
      loginId: 'supplier-login',
      password: 'supplier-password',
    });
    const persisted = await prisma.channelAccount.findUniqueOrThrow({ where: { id: rocket.id } });
    expect(persisted).toMatchObject({ name: 'Rocket Paused By User', status: 'paused' });
    expect(persisted.config).toMatchObject({ rootExtension: 'keep-me' });
    await expect(port.ensureRocketAccount(TEST_ORGANIZATION_ID))
      .rejects.toThrow('중지된 로켓 계정은 자동으로 다시 활성화하지 않습니다.');
    await expect(prisma.channelAccount.findUniqueOrThrow({ where: { id: rocket.id } }))
      .resolves.toMatchObject({ status: 'paused' });
  });

  it('claims only the active, organization-scoped Rocket identity and preserves its status', async () => {
    const rocket = await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'rocket',
        name: '쿠팡 로켓',
        externalAccountId: null,
        vendorId: null,
        status: 'active',
      },
    });
    const foreign = await prisma.channelAccount.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        channel: 'rocket',
        name: '다른 조직 로켓',
        externalAccountId: null,
        vendorId: null,
        status: 'active',
      },
    });

    const claim = (organizationId: string, accountId: string, vendorId: string) =>
      prisma.$transaction((tx) => port.claimProviderIdentity(ownerTransaction(tx), {
        organizationId,
        accountId,
        channel: 'rocket',
        expectedVendorId: null,
        vendorId,
      }));

    await claim(TEST_ORGANIZATION_ID, rocket.id, ' vendor-42 ');
    await claim(TEST_ORGANIZATION_ID, rocket.id, 'vendor-42');
    await expect(claim(TEST_ORGANIZATION_ID, rocket.id, 'vendor-99'))
      .rejects.toMatchObject({ status: 409 });
    await expect(claim(TEST_ORGANIZATION_ID, foreign.id, 'vendor-42'))
      .rejects.toMatchObject({ status: 404 });

    const claimed = await prisma.channelAccount.findUniqueOrThrow({ where: { id: rocket.id } });
    expect(claimed).toMatchObject({ vendorId: 'vendor-42', status: 'active' });

    const paused = await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'rocket',
        name: '중지된 로켓',
        externalAccountId: null,
        vendorId: null,
        status: 'paused',
      },
    });
    await expect(claim(TEST_ORGANIZATION_ID, paused.id, 'vendor-42'))
      .rejects.toMatchObject({ status: 404 });
    await expect(prisma.channelAccount.findUniqueOrThrow({ where: { id: paused.id } }))
      .resolves.toMatchObject({ vendorId: null, status: 'paused' });
  });

  async function createMallAccount(key: string, config: Prisma.InputJsonValue) {
    return prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: key,
        name: key,
        externalAccountId: key,
        status: 'configured',
        config,
      },
    });
  }
});
