import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { SourceFailureAlerts } from '../../../../../alerts/alerts.service';
import { ConfirmedChannelComponentReferenceRepositoryAdapter } from '../../../../../inventory/adapter/out/repository/confirmed-channel-component-reference.repository.adapter';
import { SellpiaImportRunRepositoryAdapter } from '../../../../../inventory/adapter/out/repository/sellpia-import-run.repository.adapter';
import { SellpiaSnapshotPublicationRepositoryAdapter } from '../../../../../inventory/adapter/out/repository/sellpia-snapshot-publication.repository.adapter';
import { SellpiaInventoryFileValidator } from '../../../../../inventory/application/service/sellpia-inventory-file.validator';
import { SellpiaInventoryImportService } from '../../../../../inventory/application/service/sellpia-inventory-import.service';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { getMallAdapterManifest } from '../../../../domain/mall/mall-adapter-manifest';
import { evaluateMallPreflight } from '../../../../domain/mall/mall-publish-preflight';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
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
   * 셀피아 스냅샷 한 번. 정본 재고 마스터(`INV-SELLPIA-*`)와 그 `isActive` 는 이 발행이
   * 만든다 — 표가 보는 사실을 테스트가 손으로 적지 않게 한다.
   */
  async function publishSellpiaSnapshot(rows: readonly string[]) {
    const alerts = new SourceFailureAlerts(prisma as never);
    const inventory = new SellpiaInventoryImportService(
      new SellpiaImportRunRepositoryAdapter(prisma as never, alerts),
      new SellpiaSnapshotPublicationRepositoryAdapter(prisma as never, alerts),
      new ConfirmedChannelComponentReferenceRepositoryAdapter(prisma as never),
      new SellpiaInventoryFileValidator(),
    );
    return inventory.importInventory({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      file: {
        buffer: Buffer.from([SELLPIA_HEADER, ...rows].join('\n')),
        fileName: 'sellpia.csv',
        mimeType: 'text/csv',
      },
      execution: { kind: 'manual', manualFreshExportConfirmed: true },
    });
  }

  async function sellpiaSku(code: string) {
    return prisma.sellpiaInventorySku.findUniqueOrThrow({
      where: { organizationId_code: { organizationId: TEST_ORGANIZATION_ID, code } },
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
      const alerts = new SourceFailureAlerts(prisma as never);
      const inventory = new SellpiaInventoryImportService(
        new SellpiaImportRunRepositoryAdapter(prisma as never, alerts),
        new SellpiaSnapshotPublicationRepositoryAdapter(prisma as never, alerts),
        new ConfirmedChannelComponentReferenceRepositoryAdapter(prisma as never),
        new SellpiaInventoryFileValidator(),
      );
      await expect(inventory.importInventory({
        organizationId: TEST_ORGANIZATION_ID,
        userId: TEST_USER_ID,
        file: {
          buffer: Buffer.from([
            '상품코드,상품명,재고,바코드,매입가,판매가',
            'SP-101,원목 블록,7,8800000000101,100,200',
          ].join('\n')),
          fileName: 'sellpia.csv',
          mimeType: 'text/csv',
        },
        execution: { kind: 'manual', manualFreshExportConfirmed: true },
      })).resolves.toMatchObject({ outcome: 'published' });
      const publishedSku = await prisma.sellpiaInventorySku.findUniqueOrThrow({
        where: { organizationId_code: { organizationId: TEST_ORGANIZATION_ID, code: 'SP-101' } },
      });
      expect(publishedSku.masterProductId).not.toBeNull();
      const unlinkedMaster = await prisma.masterProduct.create({
        data: { organizationId: TEST_ORGANIZATION_ID, code: 'KID-NO-STOCK', name: '재고 연결 없음' },
      });

      const { rows, total } = await repository.listMatrixProducts(TEST_ORGANIZATION_ID, {
        offset: 0,
        limit: 10,
      });

      expect(total).toBe(2);
      expect(rows).toEqual(expect.arrayContaining([
        expect.objectContaining({ masterProductId: publishedSku.masterProductId, stock: 7 }),
        expect.objectContaining({ masterProductId: unlinkedMaster.id, stock: null }),
      ]));
    });

    /**
     * 품절은 표에서 사라질 일이 아니다.
     *
     * 정본 재고 마스터의 `isActive` 는 "재고가 있고 파는 중"이라 재고가 0 이 되면 꺼진다.
     * 그 깃발로 행을 고르면 이미 몰에 올라간 상품이 품절되는 순간 표에서 사라져, 표가
     * "어느 몰에 무엇이 있나"를 답하지 못한다. 품절은 재고 0(빨강)으로 선다.
     */
    it('⭐ keeps an out-of-stock canonical master in the matrix with stock 0', async () => {
      await seedSellpiaSourceState();
      await expect(publishSellpiaSnapshot([
        'SP-201,품절 블록,0,8800000000201,100,200',
      ])).resolves.toMatchObject({ outcome: 'published' });
      const sku = await sellpiaSku('SP-201');
      const master = await prisma.masterProduct.findUniqueOrThrow({
        where: { id: sku.masterProductId! },
      });
      // 마스터의 판매 깃발 자체는 그대로 꺼져 있다 — 표만 다르게 읽는다.
      expect(master.isActive).toBe(false);

      const { rows } = await repository.listMatrixProducts(TEST_ORGANIZATION_ID, {
        offset: 0,
        limit: 10,
      });

      expect(rows).toEqual(expect.arrayContaining([
        expect.objectContaining({ masterProductId: master.id, stock: 0 }),
      ]));
    });

    /** 단종(SKU 가 스냅샷에서 사라짐)은 품절과 다른 사실이다. 표에서 내린다. */
    it('⭐ drops a canonical master whose Sellpia SKU left the snapshot', async () => {
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
      ])).resolves.toMatchObject({ outcome: 'published' });
      const discontinued = await sellpiaSku('SP-305');
      expect(discontinued.isActive).toBe(false);
      const alive = await sellpiaSku('SP-301');

      const { rows } = await repository.listMatrixProducts(TEST_ORGANIZATION_ID, {
        offset: 0,
        limit: 20,
      });

      const shown = rows.map((row) => row.masterProductId);
      expect(shown).toContain(alive.masterProductId);
      expect(shown).not.toContain(discontinued.masterProductId);
    });

    /** 셀피아에서 오지 않은 마스터는 종전 그대로 `isActive` 가 표에 서는 조건이다. */
    it('still hides an inactive master that has no Sellpia SKU', async () => {
      const inactive = await prisma.masterProduct.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          code: 'KID-OFF',
          name: '판매 중지',
          isActive: false,
        },
      });

      const { rows } = await repository.listMatrixProducts(TEST_ORGANIZATION_ID, {
        offset: 0,
        limit: 10,
      });

      expect(rows.map((row) => row.masterProductId)).not.toContain(inactive.id);
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

    /**
     * 송신 전 점검의 후보도 표와 같은 기준으로 세운다. 품절이라 보내지 않는다는 판정은
     * 목록에서 지우는 것이 아니라 `evaluateMallPreflight` 가 이유와 함께 말할 일이다.
     */
    it('⭐ keeps an out-of-stock canonical master as a preflight candidate and drops a discontinued one', async () => {
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
      ])).resolves.toMatchObject({ outcome: 'published' });
      const soldOut = await sellpiaSku('SP-404');
      const discontinued = await sellpiaSku('SP-405');

      const { rows } = await repository.listPreflightProducts(TEST_ORGANIZATION_ID, {
        limit: 20,
        offset: 0,
      });

      const candidates = rows.map((row) => row.masterProductId);
      expect(candidates).toContain(soldOut.masterProductId);
      expect(candidates).not.toContain(discontinued.masterProductId);
      expect(rows.find((row) => row.masterProductId === soldOut.masterProductId)?.stock).toBe(0);
    });

    /** 목록에 서는 것과 보내도 되는 것은 다르다. 후자는 송신 전 점검이 이유와 함께 답한다. */
    it('⭐ hands the sold-out row to preflight, which blocks it with out_of_stock', async () => {
      await seedSellpiaSourceState();
      await publishSellpiaSnapshot(['SP-501,품절 블록,0,8800000000501,100,200']);
      const soldOut = await sellpiaSku('SP-501');
      await prisma.masterProduct.update({
        where: { id: soldOut.masterProductId! },
        data: { imageUrls: ['a.jpg'] },
      });

      const { rows } = await repository.listPreflightProducts(TEST_ORGANIZATION_ID, {
        limit: 10,
        offset: 0,
      });
      const row = rows.find((entry) => entry.masterProductId === soldOut.masterProductId)!;
      const result = evaluateMallPreflight({
        manifest: getMallAdapterManifest('kidsnote')!,
        product: {
          masterProductId: row.masterProductId,
          name: row.name,
          salePrice: row.salePrice,
          imageCount: row.imageCount,
          optionNames: row.optionNames,
          hasMallCategory: true,
          kc: { status: 'none', number: null },
          stock: row.stock,
        },
        account: { listingProfileFields: ['shipping', 'releaseAddress', 'returnAddress'] },
      });

      expect(result.ok).toBe(false);
      expect(result.violations.map((violation) => violation.rule)).toContain('out_of_stock');
    });
  });
});
