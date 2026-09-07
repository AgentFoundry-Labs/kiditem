import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../../../../test-helpers/real-prisma';
import { MallPublishingRepositoryAdapter } from '../mall-publishing.repository.adapter';

const ORDER_COLLECTION_ACCOUNT = '30000000-0000-4000-8000-000000000001';
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
          id: ORDER_COLLECTION_ACCOUNT,
          organizationId: TEST_ORGANIZATION_ID,
          channel: 'order_collection',
          name: '키즈노트',
          externalAccountId: 'kidsnote',
          status: 'configured',
          config: {
            orderCollection: {
              loginId: 'kid-login',
              password: { version: 1, algorithm: 'aes', iv: 'x', ciphertext: 'y', tag: 'z' },
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
          channel: 'order_collection',
          name: '키즈노트',
          externalAccountId: 'kidsnote',
          status: 'configured',
        },
      ],
    });
  });

  describe('listMallAccountAnchors', () => {
    it('resolves both anchor shapes and never leaks the password value', async () => {
      const anchors = await repository.listMallAccountAnchors(TEST_ORGANIZATION_ID);
      expect(anchors).toEqual(expect.arrayContaining([
        expect.objectContaining({
          mallKey: 'kidsnote',
          channelAccountId: ORDER_COLLECTION_ACCOUNT,
          hasCredentials: true,
          source: 'order_collection',
        }),
        expect.objectContaining({
          mallKey: 'coupang',
          channelAccountId: COUPANG_ACCOUNT,
          hasCredentials: true,
          source: 'channel',
        }),
      ]));
      expect(JSON.stringify(anchors)).not.toContain('ciphertext');
    });

    it('does not return another organization rows', async () => {
      const anchors = await repository.listMallAccountAnchors(TEST_ORGANIZATION_ID);
      expect(anchors.map((anchor) => anchor.channelAccountId)).not.toContain(OTHER_ORG_ACCOUNT);
    });

    it('reports a mall with no stored password as having no credentials', async () => {
      await prisma.channelAccount.update({
        where: { id: ORDER_COLLECTION_ACCOUNT },
        data: { config: { orderCollection: { loginId: 'kid-login' } } },
      });
      const anchors = await repository.listMallAccountAnchors(TEST_ORGANIZATION_ID);
      expect(anchors.find((anchor) => anchor.mallKey === 'kidsnote')?.hasCredentials).toBe(false);
    });
  });

  describe('ensureMallAccountAnchor', () => {
    it('reuses the existing order-collection row instead of creating a second account', async () => {
      const anchor = await repository.ensureMallAccountAnchor({
        organizationId: TEST_ORGANIZATION_ID,
        mallKey: 'kidsnote',
        mallName: '키즈노트',
      });
      expect(anchor.id).toBe(ORDER_COLLECTION_ACCOUNT);
      expect(await prisma.channelAccount.count({ where: { organizationId: TEST_ORGANIZATION_ID } }))
        .toBe(2);
    });

    it('prefers the marketplace own-channel row over an order-collection row', async () => {
      await prisma.channelAccount.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          channel: 'order_collection',
          name: '쿠팡',
          externalAccountId: 'coupang',
          status: 'configured',
        },
      });
      const anchor = await repository.ensureMallAccountAnchor({
        organizationId: TEST_ORGANIZATION_ID,
        mallKey: 'coupang',
        mallName: '쿠팡(마켓플레이스)',
      });
      expect(anchor.id).toBe(COUPANG_ACCOUNT);
    });

    it('creates an order-collection anchor when the mall has none', async () => {
      const anchor = await repository.ensureMallAccountAnchor({
        organizationId: TEST_ORGANIZATION_ID,
        mallKey: 'haebub-mall',
        mallName: '해법몰',
      });
      const created = await prisma.channelAccount.findUniqueOrThrow({ where: { id: anchor.id } });
      expect(created).toMatchObject({ channel: 'order_collection', externalAccountId: 'haebub-mall' });
      expect(created.config).toBeNull();
    });
  });

  describe('profiles', () => {
    async function createDefault(name = '기본 배송') {
      return repository.createProfile({
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: ORDER_COLLECTION_ACCOUNT,
        data: {
          name,
          isDefault: true,
          categoryCode: 'K-100',
          shippingJson: { chargeType: 'free' },
          addressJson: { release: { zipCode: '10000' }, return: { zipCode: '10000' } },
        },
      });
    }

    it('creates a profile carrying the mall key from its account', async () => {
      const profile = await createDefault();
      expect(profile).toMatchObject({ mallKey: 'kidsnote', isDefault: true, categoryCode: 'K-100' });
    });

    it('demotes the previous default so only one survives the partial unique', async () => {
      const first = await createDefault('기본 배송');
      const second = await createDefault('제주 별도');
      const rows = await repository.listProfiles(TEST_ORGANIZATION_ID, ORDER_COLLECTION_ACCOUNT);
      expect(rows.filter((row) => row.isDefault).map((row) => row.id)).toEqual([second.id]);
      expect(rows.map((row) => row.id)).toContain(first.id);
    });

    it('rejects a duplicate name on the same account', async () => {
      await createDefault('기본 배송');
      await expect(repository.createProfile({
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: ORDER_COLLECTION_ACCOUNT,
        data: { name: '기본 배송' },
      })).rejects.toBeInstanceOf(ConflictException);
    });

    it('soft deletes so the row survives but stops being listed or default', async () => {
      const profile = await createDefault();
      await repository.softDeleteProfile(TEST_ORGANIZATION_ID, profile.id);
      expect(await repository.listProfiles(TEST_ORGANIZATION_ID)).toEqual([]);
      const raw = await prisma.mallListingProfile.findUniqueOrThrow({ where: { id: profile.id } });
      expect(raw.deletedAt).not.toBeNull();
      expect(raw.isDefault).toBe(false);
    });

    it('frees the default slot after a soft delete', async () => {
      const first = await createDefault('기본 배송');
      await repository.softDeleteProfile(TEST_ORGANIZATION_ID, first.id);
      await expect(createDefault('새 기본')).resolves.toMatchObject({ isDefault: true });
    });

    it('refuses to touch another organization profile', async () => {
      const profile = await createDefault();
      await expect(repository.softDeleteProfile(OTHER_ORGANIZATION_ID, profile.id))
        .rejects.toBeInstanceOf(NotFoundException);
      await expect(repository.updateProfile({
        organizationId: OTHER_ORGANIZATION_ID,
        profileId: profile.id,
        data: { name: '탈취' },
      })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('listPreflightProducts', () => {
    it('reads notice, certification, and the cheapest live option price', async () => {
      const product = await prisma.masterProduct.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          code: 'KID-1',
          name: '유아 원목 블록',
          imageUrls: ['a.jpg', 'b.jpg'],
        },
      });
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
      await prisma.productNoticeAttribute.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          masterProductId: product.id,
          noticeCategory: '어린이제품',
          attributesJson: { 제조자: '한국완구' },
        },
      });
      await prisma.productCertification.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          masterProductId: product.id,
          certType: 'safety_confirm',
          certNumber: 'KC-1',
          validTo: new Date('2027-01-31'),
        },
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
        noticeCategory: '어린이제품',
        certification: { certType: 'safety_confirm' },
      });
      expect(rows[0]?.optionNames).toEqual(expect.arrayContaining(['기본', '2개입']));
      expect(rows[0]?.optionNames).not.toContain('단종');
    });

    it('ignores a mall-specific notice override when reading the default', async () => {
      const product = await prisma.masterProduct.create({
        data: { organizationId: TEST_ORGANIZATION_ID, code: 'KID-2', name: '블록 2' },
      });
      await prisma.productNoticeAttribute.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          masterProductId: product.id,
          noticeCategory: '어린이제품',
          attributesJson: { 제조자: '몰전용' },
          channel: 'kidsnote',
        },
      });
      const { rows } = await repository.listPreflightProducts(TEST_ORGANIZATION_ID, {
        limit: 10,
        offset: 0,
      });
      expect(rows[0]?.noticeCategory).toBeNull();
    });
  });
});
