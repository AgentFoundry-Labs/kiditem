import { ListingContentQueryRepositoryAdapter } from '../../../../../content/adapter/out/repository/listing-content-query.repository.adapter';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { SourceFailureAlerts } from '../../../../../alerts/alerts.service';
import { ProductAvailabilityRepositoryAdapter } from '../../../../../products/adapter/out/persistence/product-availability.repository.adapter';
import { ProductAvailabilityUseCase } from '../../../../../products/application/service/product-availability.usecase';
import { ProductSourceCollectionRepositoryAdapter } from '../../../../../products/adapter/out/persistence/product-source-collection.repository.adapter';
import { ProductSourcePublicationRepositoryAdapter } from '../../../../../products/adapter/out/persistence/product-source-publication.repository.adapter';
import { ProductSourceReadRepositoryAdapter } from '../../../../../products/adapter/out/persistence/product-source-read.repository.adapter';
import { ProductTransactionalReadRepositoryAdapter } from '../../../../../products/adapter/out/persistence/product-transactional-read.repository.adapter';
import { SellpiaCollectionUseCase } from '../../../../../products/application/service/sellpia-collection.usecase';
import { SellpiaPayloadDecoderAdapter } from '../../../../../products/adapter/out/sellpia/sellpia-payload-decoder.adapter';
import { SellpiaPayloadValidator } from '../../../../../products/adapter/out/sellpia/sellpia-payload.validator';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { getMallAdapterManifest } from '../../../../domain/registration/mall-adapter-manifest';
import { evaluateMallPreflight } from '../../../../domain/registration/mall-publish-preflight';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../../../../test-helpers/real-prisma';
import { MallPublishingRepositoryAdapter } from '../mall-publishing.repository.adapter';
import { MallListingMatrixCellSchema } from '@kiditem/shared/mall-publishing';
import { MallPublishingService } from '../../../../application/service/registration/mall-publishing.service';
import { realRegistrationStates } from '../../../../../test-helpers/registration-state';

const KIDSNOTE_ACCOUNT = '30000000-0000-4000-8000-000000000001';
const COUPANG_ACCOUNT = '30000000-0000-4000-8000-000000000002';
const OTHER_ORG_ACCOUNT = '30000000-0000-4000-8000-000000000003';

describe('MallPublishingRepositoryAdapter (PG integration)', () => {
  let prisma: PrismaClient;
  let repository: MallPublishingRepositoryAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    repository = new MallPublishingRepositoryAdapter(
      prisma as unknown as PrismaService,
      new ProductSourceReadRepositoryAdapter(prisma as never),
      new ProductAvailabilityUseCase(
        new ProductAvailabilityRepositoryAdapter(prisma as never),
      ),
      new ListingContentQueryRepositoryAdapter(prisma as never),
    );
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

  const SELLPIA_HEADER = '상품코드,상품명,재고,바코드,매입가,판매가';

  async function seedSellpiaSourceState() {
    await prisma.sellpiaInventoryState.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceOrigin: 'https://kiditem.sellpia.com',
        sourceAccountKey: 'kiditem',
        requestedGeneration: 0n,
        verifiedGeneration: 0n,
        freshnessFence: randomUUID(),
      },
    });
  }

  /**
   * 셀피아 스냅샷 한 번. 정본 재고 마스터(`INV-SELLPIA-*`)와 재고 사실은 이 발행이
   * 만든다 — 표가 보는 사실을 테스트가 손으로 적지 않게 한다.
   */
  async function publishSellpiaSnapshot(rows: readonly string[]) {
    const alerts = new SourceFailureAlerts(prisma as never);
    const collection = new SellpiaCollectionUseCase(
      new ProductSourceCollectionRepositoryAdapter(prisma as never, alerts),
      new ProductSourcePublicationRepositoryAdapter(prisma as never, alerts),
      new SellpiaPayloadDecoderAdapter(new SellpiaPayloadValidator()),
    );
    const attempt = await collection.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      idempotencyKey: randomUUID(),
      scope: 'inventory',
    });
    return collection.completeAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      attemptId: attempt.attemptId,
      attemptToken: attempt.attemptToken,
      file: {
        buffer: Buffer.from([SELLPIA_HEADER, ...rows].join('\n')),
        fileName: 'sellpia.csv',
        mimeType: 'text/csv',
      },
    });
  }

  async function sellpiaSku(code: string) {
    const separator = code.lastIndexOf('-');
    return prisma.masterProduct.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceAccountKey: 'kiditem',
        sourceProductCode: separator > 0 ? code.slice(0, separator) : code,
        sourceOptionCode: separator > 0 ? code.slice(separator + 1) : '',
      },
    });
  }

  describe('listMatrixProducts', () => {
    /** 재고는 Inventory가 발행한 셀피아 스냅샷에서만 온다. 재고 연결이 없는 마스터는 0이 아니라 null이다. */
    it('reads each master stock from the published Sellpia snapshot and none for an unlinked master', async () => {
      await prisma.sellpiaInventoryState.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          sourceOrigin: 'https://kiditem.sellpia.com',
          sourceAccountKey: 'kiditem',
          requestedGeneration: 0n,
          verifiedGeneration: 0n,
          freshnessFence: randomUUID(),
        },
      });
      await expect(publishSellpiaSnapshot([
        'SP-101,원목 블록,7,8800000000101,100,200',
      ])).resolves.toMatchObject({ state: 'COMPLETE' });
      const publishedSku = await sellpiaSku('SP-101');
      const unlinkedMaster = await prisma.masterProduct.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          code: 'KID-NO-STK',
          sourceAccountKey: 'kiditem',
          sourceProductCode: 'KID-NO-STOCK',
          sourceOptionCode: '',
          name: '재고 연결 없음',
        },
      });

      const { rows, total } = await repository.listMatrixProducts(TEST_ORGANIZATION_ID, {
        offset: 0,
        limit: 10,
      });

      expect(total).toBe(2);
      expect(rows).toEqual(expect.arrayContaining([
        expect.objectContaining({ masterProductId: publishedSku.id, stock: 7 }),
        expect.objectContaining({ masterProductId: unlinkedMaster.id, stock: 0 }),
      ]));
    });

    /**
     * 품절은 표에서 사라질 일이 아니다.
     *
     * 정본 재고 마스터의 `isActive` 는 재고 관찰과 별개다. 그 깃발로 행을 고르면 이미
     * 몰에 올라간 상품이 품절되는 순간 표에서 사라질 수 있다. 품절은 재고 0(빨강)으로 선다.
     */
    it('⭐ keeps an out-of-stock canonical master in the matrix with stock 0', async () => {
      await seedSellpiaSourceState();
      await expect(publishSellpiaSnapshot([
        'SP-201,품절 블록,0,8800000000201,100,200',
      ])).resolves.toMatchObject({ state: 'COMPLETE' });
      const sku = await sellpiaSku('SP-201');
      const master = sku;
      // 재고 관찰은 Products 정체성을 끄지 않는다 — 표는 재고 0 으로 선다.
      expect(master.currentStock).toBe(0);

      const { rows } = await repository.listMatrixProducts(TEST_ORGANIZATION_ID, {
        offset: 0,
        limit: 10,
      });

      expect(rows).toEqual(expect.arrayContaining([
        expect.objectContaining({ masterProductId: master.id, stock: 0 }),
      ]));
    });

    /** 최신 스냅샷에서 빠진 SKU 정체성도 재고 0 으로 남아 표에서 숨기지 않는다. */
    it('⭐ retains a canonical master whose Sellpia SKU left the snapshot with stock 0', async () => {
      await seedSellpiaSourceState();
      await publishSellpiaSnapshot([
        'SP-301,블록 A,3,8800000000301,100,200',
        'SP-302,블록 B,3,8800000000302,100,200',
        'SP-303,블록 C,3,8800000000303,100,200',
        'SP-304,블록 D,3,8800000000304,100,200',
        'SP-305,단종 블록,3,8800000000305,100,200',
      ]);
      await expect(publishSellpiaSnapshot([
        'SP-301,블록 A,3,8800000000301,100,200',
        'SP-302,블록 B,3,8800000000302,100,200',
        'SP-303,블록 C,3,8800000000303,100,200',
        'SP-304,블록 D,3,8800000000304,100,200',
      ])).resolves.toMatchObject({ state: 'COMPLETE' });
      const discontinued = await sellpiaSku('SP-305');
      expect(discontinued.currentStock).toBe(0);
      const alive = await sellpiaSku('SP-301');

      const { rows } = await repository.listMatrixProducts(TEST_ORGANIZATION_ID, {
        offset: 0,
        limit: 20,
      });

      const shown = rows.map((row) => row.masterProductId);
      expect(shown).toContain(alive.id);
      expect(shown).toContain(discontinued.id);
      expect(rows.find((row) => row.masterProductId === discontinued.id)?.stock).toBe(0);
    });

    /** Products source identities outside Sellpia are not visible in the matrix. */
    it('still hides an inactive master that has no Sellpia SKU', async () => {
      const inactive = await prisma.masterProduct.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          code: 'KID-OFF',
          sourceAccountKey: 'other-source',
          sourceProductCode: 'KID-OFF',
          sourceOptionCode: '',
          name: '판매 중지',
        },
      });

      const { rows } = await repository.listMatrixProducts(TEST_ORGANIZATION_ID, {
        offset: 0,
        limit: 10,
      });

      expect(rows.map((row) => row.masterProductId)).not.toContain(inactive.id);
    });
  });

  /**
   * 같은 행을 두 리더가 다르게 읽는 것은 둘이 다른 질문에 답하기 때문이다 — 매트릭스는
   * "어느 몰에 무엇이 있나", 재고 후보 리더는 "지금 보낼 재고가 있나". 매트릭스를 고치면서
   * 재고 쪽 판정까지 끌려가지 않았는지 같은 행으로 확인한다.
   */
  /**
   * 허브 맨 위 숫자와 등록 현황 표가 같은 것을 센다. 표에는 서는데 숫자에는 빠지면
   * 사장님이 "상품 3개인데 표에 4줄"을 보고 어느 쪽이 맞는지 우리에게 묻게 된다.
   */
  describe('countVisibleMasterProducts', () => {
    it('⭐ counts the same set the matrix shows — sold-out and missing identities in', async () => {
      await seedSellpiaSourceState();
      await publishSellpiaSnapshot([
        'SP-701,블록 A,3,8800000000701,100,200',
        'SP-702,블록 B,3,8800000000702,100,200',
        'SP-703,블록 C,3,8800000000703,100,200',
        'SP-704,품절 블록,0,8800000000704,100,200',
        'SP-705,단종 블록,3,8800000000705,100,200',
      ]);
      await publishSellpiaSnapshot([
        'SP-701,블록 A,3,8800000000701,100,200',
        'SP-702,블록 B,3,8800000000702,100,200',
        'SP-703,블록 C,3,8800000000703,100,200',
        'SP-704,품절 블록,0,8800000000704,100,200',
      ]);
      await prisma.masterProduct.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          code: 'KID-OFF-CT',
          sourceAccountKey: 'other-source',
          sourceProductCode: 'KID-OFF-COUNT',
          sourceOptionCode: '',
          name: '판매 중지',
        },
      });

      const { total } = await repository.listMatrixProducts(TEST_ORGANIZATION_ID, {
        offset: 0,
        limit: 50,
      });

      // 판매중 3 + 품절 1 + 최신 스냅샷에서 빠진 정체성 1 = 5.
      expect(total).toBe(5);
      expect(await repository.countVisibleMasterProducts(TEST_ORGANIZATION_ID)).toBe(total);
    });
  });

  describe('inventory boundary', () => {
    it('⭐ leaves the sold-out candidate reader unchanged for the row the matrix now shows', async () => {
      await seedSellpiaSourceState();
      await publishSellpiaSnapshot([
        'SP-601,품절 블록,0,8800000000601,100,200',
        'SP-602,재고 블록,5,8800000000602,100,200',
      ]);
      const soldOut = await sellpiaSku('SP-601');

      const { rows } = await repository.listMatrixProducts(TEST_ORGANIZATION_ID, {
        offset: 0,
        limit: 10,
      });
      expect(rows.map((row) => row.masterProductId)).toContain(soldOut.id);

      const candidates = await prisma.$transaction(async (tx) => {
        const context = { client: tx };
        const productRead = new ProductTransactionalReadRepositoryAdapter();
        const lock = await productRead.lock(context, TEST_ORGANIZATION_ID);
        return {
          inStock: await productRead.readAvailabilityCandidates(context, lock, {
            organizationId: TEST_ORGANIZATION_ID,
            query: '블록',
            limit: 10,
            stockStatus: 'in_stock',
          }),
          all: await productRead.readAvailabilityCandidates(context, lock, {
            organizationId: TEST_ORGANIZATION_ID,
            query: '블록',
            limit: 10,
            stockStatus: 'all',
          }),
        };
      });

      // 품절 행은 여전히 '재고 있는 후보'가 아니다.
      expect(candidates.inStock.map((entry) => entry.masterProductId)).not.toContain(soldOut.id);
      expect(candidates.all).toEqual(expect.arrayContaining([
        expect.objectContaining({ masterProductId: soldOut.id, currentStock: 0 }),
      ]));
    });
  });

  describe('listPreflightProducts', () => {
    async function createProduct(code: string) {
      return prisma.masterProduct.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          code,
          sourceAccountKey: 'kiditem',
          sourceProductCode: code,
          sourceOptionCode: '',
          name: '유아 원목 블록',
          imageUrls: ['a.jpg', 'b.jpg'],
        },
      });
    }

    async function createCandidate(
      sourceUrl: string,
      rawData: Record<string, unknown>,
    ) {
      return prisma.sourceRecord.create({
        data: { sourceIdentityHash: randomUUID(),
          organizationId: TEST_ORGANIZATION_ID,
          sourceUrl,
          sourcePlatform: '1688',
          name: '원목 블록',
          rawData: rawData as never,
        },
      });
    }

    it('reads the cheapest live option price and ignores inactive options', async () => {
      const product = await createProduct('KID-1');
      const listing = await prisma.channelListing.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: COUPANG_ACCOUNT,
          externalId: 'EXT-1',
        },
      });
      const options = await prisma.channelListingOption.createManyAndReturn({
        data: [
          { listingId: listing.id, organizationId: TEST_ORGANIZATION_ID, externalOptionId: 'O-1', itemName: '기본', salePrice: 24900 },
          { listingId: listing.id, organizationId: TEST_ORGANIZATION_ID, externalOptionId: 'O-2', itemName: '2개입', salePrice: 19900 },
          { listingId: listing.id, organizationId: TEST_ORGANIZATION_ID, externalOptionId: 'O-3', itemName: '단종', salePrice: 100, isActive: false },
        ],
      });
      await prisma.channelListingOptionInventoryComponent.createMany({
        data: options.map((option) => ({
          organizationId: TEST_ORGANIZATION_ID,
          channelListingOptionId: option.id,
          masterProductId: product.id,
          quantity: 1,
        })),
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
        certificationNumbers: [],
      });
      expect(rows[0]?.optionNames).toEqual(expect.arrayContaining(['기본', '2개입']));
      expect(rows[0]?.optionNames).not.toContain('단종');
    });

    /** KC 는 운영자가 상품 기본 탭에서 입력한 수집상품 초안(`rawData.manualBasics`)에서 읽는다. */
    it('⭐ reads KC input from the linked sourcing candidate draft', async () => {
      const product = await createProduct('KID-2');
      await createCandidate('https://example.com/kid-2', {
        manualBasics: { kcCertificationStatus: 'exists', kcCertificationNumber: 'CB061R1234-1001' },
      });
      const draft = await prisma.salesProduct.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          name: '원목 블록',
          certifications: [{ number: 'CB061R1234-1001' }],
        },
      });
      await prisma.channelListing.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: COUPANG_ACCOUNT,
          salesProductId: draft.id,
          externalId: 'EXT-2',
        },
      });
      const listing = await prisma.channelListing.findFirstOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID, externalId: 'EXT-2' },
        select: { id: true },
      });
      const option = await prisma.channelListingOption.create({
        data: {
          listingId: listing.id,
          organizationId: TEST_ORGANIZATION_ID,
          externalOptionId: 'O-2',
          itemName: '기본',
        },
      });
      await prisma.channelListingOptionInventoryComponent.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          channelListingOptionId: option.id,
          masterProductId: product.id,
          quantity: 1,
        },
      });

      const { rows } = await repository.listPreflightProducts(TEST_ORGANIZATION_ID, { limit: 10, offset: 0 });
      expect(rows[0]?.certificationNumbers).toEqual(['CB061R1234-1001']);
    });

    it('reads every certificate number the draft holds', async () => {
      const product = await createProduct('KID-3');
      const draft = await prisma.salesProduct.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          name: '원목 블록',
          certifications: [{ number: 'CB999' }],
        },
      });
      await prisma.channelListing.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: COUPANG_ACCOUNT,
          externalId: 'EXT-3',
          salesProductId: draft.id,
        },
      });
      const listing = await prisma.channelListing.findFirstOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID, externalId: 'EXT-3' },
        select: { id: true },
      });
      const option = await prisma.channelListingOption.create({
        data: {
          listingId: listing.id,
          organizationId: TEST_ORGANIZATION_ID,
          externalOptionId: 'O-3',
          itemName: '기본',
        },
      });
      await prisma.channelListingOptionInventoryComponent.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          channelListingOptionId: option.id,
          masterProductId: product.id,
          quantity: 1,
        },
      });

      const { rows } = await repository.listPreflightProducts(TEST_ORGANIZATION_ID, { limit: 10, offset: 0 });
      expect(rows[0]?.certificationNumbers).toEqual(['CB999']);
    });

    it("⭐ 'KC 해당 없음'은 인증 문서 없이 그대로 읽힌다", async () => {
      const product = await createProduct('KID-4');
      const draft = await prisma.salesProduct.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          name: 'KC 대상 아님',
          kcStatus: 'none',
        },
      });
      await prisma.channelListing.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: COUPANG_ACCOUNT,
          externalId: 'EXT-4',
          salesProductId: draft.id,
        },
      });
      const listing = await prisma.channelListing.findFirstOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID, externalId: 'EXT-4' },
        select: { id: true },
      });
      const option = await prisma.channelListingOption.create({
        data: {
          listingId: listing.id,
          organizationId: TEST_ORGANIZATION_ID,
          externalOptionId: 'O-4',
          itemName: '기본',
        },
      });
      await prisma.channelListingOptionInventoryComponent.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          channelListingOptionId: option.id,
          masterProductId: product.id,
          quantity: 1,
        },
      });

      const { rows } = await repository.listPreflightProducts(TEST_ORGANIZATION_ID, { limit: 10, offset: 0 });
      expect(rows[0]).toMatchObject({ certificationNumbers: [], kcStatus: 'none' });
    });

    /**
     * 송신 전 점검의 후보도 표와 같은 기준으로 세운다. 품절이라 보내지 않는다는 판정은
     * 목록에서 지우는 것이 아니라 `evaluateMallPreflight` 가 이유와 함께 말할 일이다.
     */
    it('⭐ keeps out-of-stock and latest-snapshot-missing canonical masters as preflight candidates', async () => {
      await seedSellpiaSourceState();
      await publishSellpiaSnapshot([
        'SP-401,블록 A,3,8800000000401,100,200',
        'SP-402,블록 B,3,8800000000402,100,200',
        'SP-403,블록 C,3,8800000000403,100,200',
        'SP-404,품절 블록,0,8800000000404,100,200',
        'SP-405,단종 블록,3,8800000000405,100,200',
      ]);
      await expect(publishSellpiaSnapshot([
        'SP-401,블록 A,3,8800000000401,100,200',
        'SP-402,블록 B,3,8800000000402,100,200',
        'SP-403,블록 C,3,8800000000403,100,200',
        'SP-404,품절 블록,0,8800000000404,100,200',
      ])).resolves.toMatchObject({ state: 'COMPLETE' });
      const soldOut = await sellpiaSku('SP-404');
      const discontinued = await sellpiaSku('SP-405');

      const { rows } = await repository.listPreflightProducts(TEST_ORGANIZATION_ID, {
        limit: 20,
        offset: 0,
      });

      const candidates = rows.map((row) => row.masterProductId);
      expect(candidates).toContain(soldOut.id);
      expect(candidates).toContain(discontinued.id);
      expect(rows.find((row) => row.masterProductId === soldOut.id)?.stock).toBe(0);
      expect(rows.find((row) => row.masterProductId === discontinued.id)?.stock).toBe(0);
    });

    /** 목록에 서는 것과 보내도 되는 것은 다르다. 후자는 송신 전 점검이 이유와 함께 답한다. */
    it('⭐ hands the sold-out row to preflight, which blocks it with out_of_stock', async () => {
      await seedSellpiaSourceState();
      await publishSellpiaSnapshot(['SP-501,품절 블록,0,8800000000501,100,200']);
      const soldOut = await sellpiaSku('SP-501');
      await prisma.masterProduct.update({
        where: { id: soldOut.id },
        data: { imageUrls: ['a.jpg'] },
      });

      const { rows } = await repository.listPreflightProducts(TEST_ORGANIZATION_ID, {
        limit: 10,
        offset: 0,
      });
      const row = rows.find((entry) => entry.masterProductId === soldOut.id)!;
      const result = evaluateMallPreflight({
        manifest: getMallAdapterManifest('kidsnote')!,
        product: {
          masterProductId: row.masterProductId,
          name: row.name,
          salePrice: row.salePrice,
          imageCount: row.imageCount,
          optionNames: row.optionNames,
          hasMallCategory: true,
          certificationNumbers: ['CB061R1234-1001'],
          kcStatus: row.kcStatus,
          stock: row.stock,
        },
        account: { listingProfileFields: ['shipping', 'releaseAddress', 'returnAddress'] },
      });

      expect(result.ok).toBe(false);
      expect(result.violations.map((violation) => violation.rule)).toContain('out_of_stock');
    });
  });

  describe('listingMatrix registration', () => {
    /** 판매 상품이 있는 리스팅 칸은 그 상품 × 계정의 등록 상태를 싣는다(KID-320). 판매 상품 없는 칸은 null. */
    it('carries the registration state on a cell whose listing has a sales product', async () => {
      await seedSellpiaSourceState();
      await publishSellpiaSnapshot([
        'SP-601,원목 블록,5,8800000000601,100,200',
        'SP-602,나무 기차,5,8800000000602,100,200',
      ]);
      const linkedMaster = await sellpiaSku('SP-601');
      const unlinkedMaster = await sellpiaSku('SP-602');
      const salesProduct = await prisma.salesProduct.create({
        data: { organizationId: TEST_ORGANIZATION_ID, code: 'KID-601', status: 'active', name: '원목 블록' },
      });
      const target = await prisma.registrationTarget.create({
        data: { organizationId: TEST_ORGANIZATION_ID, salesProductId: salesProduct.id, channelAccountId: COUPANG_ACCOUNT },
      });
      await prisma.productRegistrationExecution.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID, registrationTargetId: target.id, channelAccountId: COUPANG_ACCOUNT,
          executionKind: 'register', idempotencyKey: randomUUID(), requestHash: 'a'.repeat(64),
          status: 'succeeded', providerOutcome: 'succeeded',
        },
      });
      for (const [externalId, master, salesProductId] of [
        ['EXT-601', linkedMaster, salesProduct.id],
        ['EXT-602', unlinkedMaster, null],
      ] as const) {
        const listing = await prisma.channelListing.create({
          data: { organizationId: TEST_ORGANIZATION_ID, channelAccountId: COUPANG_ACCOUNT, externalId, status: '승인완료', salesProductId },
        });
        const option = await prisma.channelListingOption.create({
          data: { listingId: listing.id, organizationId: TEST_ORGANIZATION_ID, externalOptionId: `${externalId}-O`, itemName: '기본' },
        });
        await prisma.channelListingOptionInventoryComponent.create({
          data: { organizationId: TEST_ORGANIZATION_ID, channelListingOptionId: option.id, masterProductId: master.id, quantity: 1 },
        });
      }
      const service = new MallPublishingService(repository, {} as never, realRegistrationStates(prisma));

      const matrix = await service.listingMatrix(TEST_ORGANIZATION_ID, { page: 1, limit: 10 });

      const cell = (masterProductId: string) => matrix.rows
        .find((row) => row.masterProductId === masterProductId)?.cells
        .find((entry) => entry.mallKey === 'coupang');
      expect(cell(linkedMaster.id)).toMatchObject({
        state: 'published',
        registration: { channelAccountId: COUPANG_ACCOUNT, registrationTargetId: target.id, state: 'registered' },
      });
      expect(cell(unlinkedMaster.id)).toMatchObject({ state: 'published', registration: null });
      // 계약 고정: 실제 칸이 엄격한 공유 스키마를 그대로 지난다.
      for (const entry of [cell(linkedMaster.id), cell(unlinkedMaster.id)]) {
        expect(MallListingMatrixCellSchema.strict().parse(entry)).toEqual(entry);
      }
    });

    it('gives a cell of an older listing on the same account no registration row of the newer listing', async () => {
      await seedSellpiaSourceState();
      await publishSellpiaSnapshot([
        'SP-611,원목 블록,5,8800000000611,100,200',
        'SP-612,나무 기차,5,8800000000612,100,200',
      ]);
      const olderMaster = await sellpiaSku('SP-611');
      const newerMaster = await sellpiaSku('SP-612');
      const salesProduct = await prisma.salesProduct.create({
        data: { organizationId: TEST_ORGANIZATION_ID, code: 'KID-611', status: 'active', name: '원목 블록' },
      });
      const listingIds: string[] = [];
      for (const [externalId, master, status, updatedAt] of [
        ['EXT-611', olderMaster, '승인반려', new Date('2026-09-20T00:00:00Z')],
        ['EXT-612', newerMaster, '승인완료', new Date('2026-09-22T00:00:00Z')],
      ] as const) {
        const listing = await prisma.channelListing.create({
          data: { organizationId: TEST_ORGANIZATION_ID, channelAccountId: COUPANG_ACCOUNT, externalId, status, salesProductId: salesProduct.id, updatedAt },
        });
        listingIds.push(listing.id);
        const option = await prisma.channelListingOption.create({
          data: { listingId: listing.id, organizationId: TEST_ORGANIZATION_ID, externalOptionId: `${externalId}-O`, itemName: '기본' },
        });
        await prisma.channelListingOptionInventoryComponent.create({
          data: { organizationId: TEST_ORGANIZATION_ID, channelListingOptionId: option.id, masterProductId: master.id, quantity: 1 },
        });
      }
      const service = new MallPublishingService(repository, {} as never, realRegistrationStates(prisma));

      const matrix = await service.listingMatrix(TEST_ORGANIZATION_ID, { page: 1, limit: 10 });

      const cell = (masterProductId: string) => matrix.rows
        .find((row) => row.masterProductId === masterProductId)?.cells
        .find((entry) => entry.mallKey === 'coupang');
      expect(cell(newerMaster.id)).toMatchObject({ registration: { channelListingId: listingIds[1], state: 'registered' } });
      expect(cell(olderMaster.id)).toMatchObject({ state: 'error', rawStatus: '승인반려', registration: null });
    });
  });
});
