import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../../../prisma/prisma.service';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../../../../test-helpers/real-prisma';
import { MallPublishingRepositoryAdapter } from '../mall-publishing.repository.adapter';

const KIDSNOTE_ACCOUNT = '30000000-0000-4000-8000-000000000001';
const COUPANG_ACCOUNT = '30000000-0000-4000-8000-000000000002';
const OTHER_ORG_ACCOUNT = '30000000-0000-4000-8000-000000000003';

describe('MallPublishingRepositoryAdapter (PG integration)', () => {
  let prisma: PrismaClient;
  let repository: MallPublishingRepositoryAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    repository = new MallPublishingRepositoryAdapter(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await prisma.channelAccount.createMany({
      data: [
        {
          // ADR-0012: 몰 행은 channel · externalAccountId 모두 몰 키다.
          id: KIDSNOTE_ACCOUNT,
          organizationId: TEST_ORGANIZATION_ID,
          channel: 'kidsnote',
          name: '키즈노트',
          externalAccountId: 'kidsnote',
          status: 'configured',
          config: {
            orderCollection: {
              loginId: 'kid-login',
              password: { version: 1, algorithm: 'aes', iv: 'x', ciphertext: 'y', tag: 'z' },
            },
            listingProfile: {
              shipping: { chargeType: 'free' },
              releaseAddress: { zipCode: '10000' },
              returnAddress: {},
              asPhone: '  ',
              categoryCode: 'K-100',
            },
          },
        },
        {
          id: COUPANG_ACCOUNT,
          organizationId: TEST_ORGANIZATION_ID,
          channel: 'coupang',
          name: 'Coupang Wing',
          externalAccountId: 'wing-1',
          status: 'active',
        },
        {
          id: OTHER_ORG_ACCOUNT,
          organizationId: OTHER_ORGANIZATION_ID,
          channel: 'kidsnote',
          name: '키즈노트',
          externalAccountId: 'kidsnote',
          status: 'configured',
        },
      ],
    });
  });

  describe('listMallAccounts', () => {
    it('reads one row per mall key and never leaks the password value', async () => {
      const accounts = await repository.listMallAccounts(TEST_ORGANIZATION_ID);
      expect(accounts).toEqual(expect.arrayContaining([
        expect.objectContaining({ mallKey: 'kidsnote', channelAccountId: KIDSNOTE_ACCOUNT, hasCredentials: true }),
        expect.objectContaining({ mallKey: 'coupang', channelAccountId: COUPANG_ACCOUNT, hasCredentials: true }),
      ]));
      expect(JSON.stringify(accounts)).not.toContain('ciphertext');
    });

    it('does not return another organization rows', async () => {
      const accounts = await repository.listMallAccounts(TEST_ORGANIZATION_ID);
      expect(accounts.map((account) => account.channelAccountId)).not.toContain(OTHER_ORG_ACCOUNT);
    });

    it('reports a mall with no stored password as having no credentials', async () => {
      await prisma.channelAccount.update({
        where: { id: KIDSNOTE_ACCOUNT },
        data: { config: { orderCollection: { loginId: 'kid-login' } } },
      });
      const accounts = await repository.listMallAccounts(TEST_ORGANIZATION_ID);
      expect(accounts.find((account) => account.mallKey === 'kidsnote')?.hasCredentials).toBe(false);
    });

    /** 등록 기본값은 같은 계정 행의 `config.listingProfile` 문서다. 빈 값은 채운 것으로 치지 않는다. */
    it('⭐ reads the listing profile from the same account row as the login', async () => {
      const accounts = await repository.listMallAccounts(TEST_ORGANIZATION_ID);
      expect(accounts.find((account) => account.mallKey === 'kidsnote')?.listingProfile).toEqual({
        shipping: { chargeType: 'free' },
        returnPolicy: null,
        releaseAddress: { zipCode: '10000' },
        returnAddress: null,
        asPhone: null,
        categoryCode: 'K-100',
        namePrefix: null,
        nameSuffix: null,
      });
      expect(accounts.find((account) => account.mallKey === 'coupang')?.listingProfile).toBeNull();
    });

    it('picks the primary row when a marketplace has several accounts', async () => {
      const secondary = await prisma.channelAccount.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          channel: 'coupang',
          name: 'Coupang Wing 2',
          externalAccountId: 'wing-2',
          status: 'active',
          isPrimary: true,
        },
      });
      const accounts = await repository.listMallAccounts(TEST_ORGANIZATION_ID);
      expect(accounts.filter((account) => account.mallKey === 'coupang').map((account) => account.channelAccountId))
        .toEqual([secondary.id]);
    });

    it('never creates an account row', async () => {
      await repository.listMallAccounts(TEST_ORGANIZATION_ID);
      expect(await prisma.channelAccount.count({ where: { organizationId: TEST_ORGANIZATION_ID } })).toBe(2);
    });
  });

  describe('listPreflightProducts', () => {
    async function createProduct(code: string) {
      return prisma.masterProduct.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          code,
          name: '유아 원목 블록',
          imageUrls: ['a.jpg', 'b.jpg'],
        },
      });
    }

    async function createCandidate(
      sourceUrl: string,
      rawData: Record<string, unknown>,
      provenanceMasterProductId?: string,
    ) {
      return prisma.sourcingCandidate.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          sourceUrl,
          sourcePlatform: '1688',
          name: '원목 블록',
          rawData: rawData as never,
          ...(provenanceMasterProductId ? { provenanceMasterProductId } : {}),
        },
      });
    }

    it('reads the cheapest live option price and ignores inactive options', async () => {
      const product = await createProduct('KID-1');
      const listing = await prisma.channelListing.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: COUPANG_ACCOUNT,
          masterProductId: product.id,
          externalId: 'EXT-1',
        },
      });
      await prisma.channelListingOption.createMany({
        data: [
          { listingId: listing.id, organizationId: TEST_ORGANIZATION_ID, externalOptionId: 'O-1', itemName: '기본', salePrice: 24900 },
          { listingId: listing.id, organizationId: TEST_ORGANIZATION_ID, externalOptionId: 'O-2', itemName: '2개입', salePrice: 19900 },
          { listingId: listing.id, organizationId: TEST_ORGANIZATION_ID, externalOptionId: 'O-3', itemName: '단종', salePrice: 100, isActive: false },
        ],
      });

      const { rows, total } = await repository.listPreflightProducts(TEST_ORGANIZATION_ID, {
        limit: 10,
        offset: 0,
      });
      expect(total).toBe(1);
      expect(rows[0]).toMatchObject({
        code: 'KID-1',
        imageCount: 2,
        // 비활성 옵션의 100원은 대표가로 잡히면 안 된다.
        salePrice: 19900,
        // 수집상품이 이어지지 않은 상품은 KC 입력값을 모른다.
        kc: null,
      });
      expect(rows[0]?.optionNames).toEqual(expect.arrayContaining(['기본', '2개입']));
      expect(rows[0]?.optionNames).not.toContain('단종');
    });

    /** KC 는 운영자가 상품 기본 탭에서 입력한 수집상품 초안(`rawData.manualBasics`)에서 읽는다. */
    it('⭐ reads KC input from the linked sourcing candidate draft', async () => {
      const product = await createProduct('KID-2');
      await createCandidate('https://example.com/kid-2', {
        manualBasics: { kcCertificationStatus: 'exists', kcCertificationNumber: 'CB061R1234-1001' },
      }, product.id);

      const { rows } = await repository.listPreflightProducts(TEST_ORGANIZATION_ID, { limit: 10, offset: 0 });
      expect(rows[0]?.kc).toEqual({ status: 'exists', number: 'CB061R1234-1001' });
    });

    it('falls back to the shared mall certificate number and to the listing that was registered from a candidate', async () => {
      const product = await createProduct('KID-3');
      const candidate = await createCandidate('https://example.com/kid-3', {
        manualBasics: { kcCertificationStatus: 'exists', mallRegisterShared: { certNumber: 'CB999' } },
      });
      await prisma.channelListing.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: COUPANG_ACCOUNT,
          masterProductId: product.id,
          externalId: 'EXT-3',
          sourceCandidateId: candidate.id,
        },
      });

      const { rows } = await repository.listPreflightProducts(TEST_ORGANIZATION_ID, { limit: 10, offset: 0 });
      expect(rows[0]?.kc).toEqual({ status: 'exists', number: 'CB999' });
    });
  });
});
