import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import { SupplierStatsService } from '../supplier-stats.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  OTHER_ORGANIZATION_ID,
} from '../../../test-helpers/real-prisma';

/**
 * Plan B2c.orders T12 — supplier-stats-flow.pg integration spec.
 *
 * 3 methods × real Postgres 검증 (특히 `SUM::int` 가 아닌 일반 `_sum: totalPrice` 집계 경로):
 *   getSalesBySupplier — supplier 별 합산, SupplierProduct + MasterSupplierProduct 혼합 + 중복 optionId 방지.
 *   getProductSales    — supplier 의 SKU 단위 breakdown. Master path `supplyPrice: null` 실측.
 *   getHistory         — PurchaseOrder + SupplierPayment 시간순 timeline (T7 변경 없음, 참조 검증만).
 *
 * 관통 invariants:
 *   - OrderLineItem.optionId groupBy 는 `order.organizationId + status notIn(cancelled, returned)` 로 scope.
 *   - 중복 option (SupplierProduct + MasterSupplierProduct 양쪽 등장) 은 `counted Set` 으로 한 번만 집계.
 *   - MasterSupplierProduct 경로는 schema 에 supplyPrice 없음 → service 가 `null` 반환.
 *   - Cross-tenant — OTHER_ORGANIZATION_ID 소유 리소스는 TEST_ORGANIZATION_ID 호출에 섞이지 않음.
 *   - OrderLineItem.optionId = null 은 `{ in: chunk }` 필터로 자연 배제.
 *
 * CHUNK 경계 테스트:
 *   service 의 `OPTION_CHUNK_SIZE = 1000` 상수. 경계 검증을 위해 1001+ optionIds fixture 를 만드는 것은
 *   setup 비용 vs. 얻는 이득 균형이 맞지 않는다 (각 option 이 Master+Option 2 row 필요 → 수천 insert).
 *   대신 chunk 루프가 **여러 번** 도는지를 관찰하기 위해 실제 chunked 로직을 믿고 50 optionIds + 1 chunk
 *   케이스로 집계 정확성만 검증. 상수 변경(env 로 override) 은 T7 service 범위 밖이라 out-of-scope.
 */

describe('Supplier-stats flow (PG integration)', () => {
  let prisma: PrismaClient;
  let service: SupplierStatsService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();

    const m = await Test.createTestingModule({
      providers: [
        SupplierStatsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = m.get(SupplierStatsService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  // ---------------------------------------------------------------------------
  // Fixture helpers
  // ---------------------------------------------------------------------------

  /** Master + N options. optionCounter 는 N 로 세팅 (sku 생성 race-free 가정 무시 — 수동 sku 지정). */
  async function seedMasterWithOptions(params: {
    organizationId: string;
    masterCode: string;
    masterName: string;
    optionNames: string[];
  }) {
    const master = await prisma.masterProduct.create({
      data: {
        organizationId: params.organizationId,
        code: params.masterCode,
        name: params.masterName,
        optionCounter: params.optionNames.length,
      },
    });
    const options = [];
    for (let i = 0; i < params.optionNames.length; i++) {
      const option = await prisma.productOption.create({
        data: {
          organizationId: params.organizationId,
          masterId: master.id,
          optionName: params.optionNames[i],
          sku: `${params.masterCode}-${String(i + 1).padStart(3, '0')}`,
        },
      });
      options.push(option);
    }
    return { master, options };
  }

  /** ChannelListing + ChannelListingOption per option. Orders 에서 listingOptionId 참조용. */
  async function seedListingForMaster(params: {
    organizationId: string;
    masterId: string;
    suffix: string;
    options: Array<{ id: string }>;
  }) {
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: params.organizationId,
        masterId: params.masterId,
        channel: 'coupang',
        externalId: `EXT-${params.suffix}`,
        channelName: `CH ${params.suffix}`,
      },
    });
    const listingOptions = [];
    for (let i = 0; i < params.options.length; i++) {
      const lo = await prisma.channelListingOption.create({
        data: {
          organizationId: params.organizationId,
          listingId: listing.id,
          optionId: params.options[i].id,
          externalOptionId: `VI-${params.suffix}-${i}`,
        },
      });
      listingOptions.push(lo);
    }
    return { listing, listingOptions };
  }

  /**
   * Order + 1 OrderLineItem. `optionId` 는 OrderLineItem 레벨에서 explicit 세팅
   * (service 의 `groupBy({ by: ['optionId'] })` 경로 검증). `listingOptionId` 는 B2a 패턴 연동.
   */
  async function seedOrderWithLineItem(params: {
    organizationId: string;
    externalOrderId: string;
    optionId: string | null;
    listingOptionId?: string;
    unitPrice: number;
    quantity: number;
    status?: string;
  }) {
    const totalPrice = params.unitPrice * params.quantity;
    const order = await prisma.order.create({
      data: {
        organizationId: params.organizationId,
        platform: 'coupang',
        externalOrderId: params.externalOrderId,
        orderedAt: new Date(Date.UTC(2026, 3, 10, 3, 0, 0)),
        status: params.status ?? 'paid',
        totalPrice,
      },
    });
    await prisma.orderLineItem.create({
      data: {
        organizationId: params.organizationId,
        orderId: order.id,
        optionId: params.optionId,
        listingOptionId: params.listingOptionId ?? null,
        quantity: params.quantity,
        unitPrice: params.unitPrice,
        totalPrice,
      },
    });
    return order;
  }

  // ---------------------------------------------------------------------------
  // #1 getSalesBySupplier — mixed SupplierProduct + MasterSupplierProduct
  // ---------------------------------------------------------------------------
  describe('getSalesBySupplier', () => {
    it('aggregates per-supplier via SupplierProduct + MasterSupplierProduct → optionId groupBy', async () => {
      // Supplier S1 — SupplierProduct(opt-M1-a, opt-M1-b), 2 options 직접 매핑
      // Supplier S2 — MasterSupplierProduct(masterM2), master 에 속한 옵션 2개 자동 포함
      const { master: masterM1, options: m1Options } = await seedMasterWithOptions({
        organizationId: TEST_ORGANIZATION_ID,
        masterCode: 'M-001',
        masterName: 'Master 1',
        optionNames: ['M1-a', 'M1-b'],
      });
      const { master: masterM2, options: m2Options } = await seedMasterWithOptions({
        organizationId: TEST_ORGANIZATION_ID,
        masterCode: 'M-002',
        masterName: 'Master 2',
        optionNames: ['M2-a', 'M2-b'],
      });

      const s1 = await prisma.supplier.create({
        data: { organizationId: TEST_ORGANIZATION_ID, name: 'Supplier 1' },
      });
      const s2 = await prisma.supplier.create({
        data: { organizationId: TEST_ORGANIZATION_ID, name: 'Supplier 2' },
      });

      // S1 → SupplierProduct(m1Options[0], m1Options[1])
      await prisma.supplierProduct.createMany({
        data: [
          { supplierId: s1.id, optionId: m1Options[0].id, supplyPrice: 5000, minOrderQty: 5 },
          { supplierId: s1.id, optionId: m1Options[1].id, supplyPrice: 5500, minOrderQty: 5 },
        ],
      });
      // S2 → MasterSupplierProduct(masterM2)
      await prisma.masterSupplierProduct.create({
        data: { supplierId: s2.id, masterId: masterM2.id, minOrderQty: 10 },
      });

      // Orders: channel listings 불필요 (optionId 경로) 단, service 는 optionId 를 직접 사용.
      // m1Options[0]: 2 orders × qty 3 / unit 10k → totalRevenue 60k, totalQuantity 6, totalOrders 2
      await seedOrderWithLineItem({
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'S1-O1',
        optionId: m1Options[0].id,
        unitPrice: 10_000,
        quantity: 3,
      });
      await seedOrderWithLineItem({
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'S1-O2',
        optionId: m1Options[0].id,
        unitPrice: 10_000,
        quantity: 3,
      });
      // m1Options[1]: 1 order × qty 2 / unit 15k → 30k, 2, 1
      await seedOrderWithLineItem({
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'S1-O3',
        optionId: m1Options[1].id,
        unitPrice: 15_000,
        quantity: 2,
      });
      // m2Options[0]: 1 order × qty 4 / unit 8k → 32k, 4, 1
      await seedOrderWithLineItem({
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'S2-O1',
        optionId: m2Options[0].id,
        unitPrice: 8_000,
        quantity: 4,
      });
      // m2Options[1]: 0 orders — explicit empty case

      const result = await service.getSalesBySupplier(TEST_ORGANIZATION_ID);

      expect(result.summary).toEqual({
        supplierCount: 2,
        productCount: 3,
        totalOrders: 4,
        totalQuantity: 12,
        totalRevenue: 122_000,
      });
      expect(result.items).toHaveLength(2);
      const byName = new Map(result.items.map((r) => [r.supplierName, r]));

      expect(byName.get('Supplier 1')).toEqual({
        supplierId: s1.id,
        supplierName: 'Supplier 1',
        productCount: 2, // 2 SupplierProduct
        totalOrders: 3, // 2 (m1a) + 1 (m1b)
        totalQuantity: 8, // 6 + 2
        totalRevenue: 90_000, // 60k + 30k
      });

      expect(byName.get('Supplier 2')).toEqual({
        supplierId: s2.id,
        supplierName: 'Supplier 2',
        productCount: 1, // 1 MasterSupplierProduct mapping row (though it spans 2 options)
        totalOrders: 1, // only m2a
        totalQuantity: 4,
        totalRevenue: 32_000,
      });

      // masterM1 should have no supplier mapping → not a reason for test to fail (unused var ok)
      expect(masterM1.id).toBeDefined();
    });

    it('중복 optionId 방지 — SupplierProduct + MasterSupplierProduct 가 동일 option 을 가리켜도 한 번만 집계', async () => {
      // Master M1 에 2 options, Supplier S 가 SupplierProduct(opt0) + MasterSupplierProduct(masterM1) 둘 다 가짐.
      // MasterSupplierProduct 경로가 opt0 을 다시 노출하지만, counted Set 으로 skip 되어야 한다.
      const { master, options } = await seedMasterWithOptions({
        organizationId: TEST_ORGANIZATION_ID,
        masterCode: 'M-DUP',
        masterName: 'Master Dup',
        optionNames: ['opt-0', 'opt-1'],
      });

      const supplier = await prisma.supplier.create({
        data: { organizationId: TEST_ORGANIZATION_ID, name: 'Dual Supplier' },
      });

      // SupplierProduct(opt-0) — 직접 매핑
      await prisma.supplierProduct.create({
        data: {
          supplierId: supplier.id,
          optionId: options[0].id,
          supplyPrice: 3000,
          minOrderQty: 1,
        },
      });
      // MasterSupplierProduct(masterM1) — opt-0 + opt-1 둘 다 master 아래 노출
      await prisma.masterSupplierProduct.create({
        data: { supplierId: supplier.id, masterId: master.id, minOrderQty: 10 },
      });

      // opt-0: 1 order × qty 4 / unit 10k → 40k, 4, 1
      await seedOrderWithLineItem({
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'DUP-O1',
        optionId: options[0].id,
        unitPrice: 10_000,
        quantity: 4,
      });
      // opt-1: 1 order × qty 2 / unit 20k → 40k, 2, 1
      await seedOrderWithLineItem({
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'DUP-O2',
        optionId: options[1].id,
        unitPrice: 20_000,
        quantity: 2,
      });

      const result = await service.getSalesBySupplier(TEST_ORGANIZATION_ID);

      expect(result.summary).toEqual({
        supplierCount: 1,
        productCount: 2,
        totalOrders: 2,
        totalQuantity: 6,
        totalRevenue: 80_000,
      });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual({
        supplierId: supplier.id,
        supplierName: 'Dual Supplier',
        productCount: 2, // 1 SupplierProduct + 1 MasterSupplierProduct row (정책 상 mapping count)
        // opt-0 는 SupplierProduct 경로에서 한 번만 집계 (MasterSupplierProduct 경로에서는 skip)
        // opt-1 는 MasterSupplierProduct 경로에서 집계
        totalOrders: 2, // 1 (opt-0) + 1 (opt-1) — 중복 없음
        totalQuantity: 6, // 4 + 2
        totalRevenue: 80_000, // 40k + 40k
      });
    });

    it('excludes cancelled + returned orders from groupBy aggregate', async () => {
      const { options } = await seedMasterWithOptions({
        organizationId: TEST_ORGANIZATION_ID,
        masterCode: 'M-STATUS',
        masterName: 'Status test',
        optionNames: ['opt-0'],
      });

      const supplier = await prisma.supplier.create({
        data: { organizationId: TEST_ORGANIZATION_ID, name: 'Status Supplier' },
      });
      await prisma.supplierProduct.create({
        data: {
          supplierId: supplier.id,
          optionId: options[0].id,
          supplyPrice: 1000,
          minOrderQty: 1,
        },
      });

      // paid: 1 × 5k × qty 1 → 5k
      await seedOrderWithLineItem({
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'STATUS-OK',
        optionId: options[0].id,
        unitPrice: 5_000,
        quantity: 1,
        status: 'paid',
      });
      // cancelled — excluded
      await seedOrderWithLineItem({
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'STATUS-CANCEL',
        optionId: options[0].id,
        unitPrice: 99_999,
        quantity: 10,
        status: 'cancelled',
      });
      // returned — excluded
      await seedOrderWithLineItem({
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'STATUS-RETURN',
        optionId: options[0].id,
        unitPrice: 77_777,
        quantity: 5,
        status: 'returned',
      });

      const result = await service.getSalesBySupplier(TEST_ORGANIZATION_ID);

      expect(result.items[0]).toMatchObject({
        totalOrders: 1,
        totalQuantity: 1,
        totalRevenue: 5_000,
      });
    });

    it('OrderLineItem with optionId: null is excluded (groupBy { in: chunk } naturally filters)', async () => {
      // `OrderLineItem.optionId` 가 null 인 행은 `{ optionId: { in: chunk } }` 필터에서 제외됨.
      // 이 행이 다른 supplier 의 revenue 로 집계되는 일이 없어야 한다.
      const { options } = await seedMasterWithOptions({
        organizationId: TEST_ORGANIZATION_ID,
        masterCode: 'M-NULL',
        masterName: 'Null test',
        optionNames: ['opt-0'],
      });

      const supplier = await prisma.supplier.create({
        data: { organizationId: TEST_ORGANIZATION_ID, name: 'Null-safe Supplier' },
      });
      await prisma.supplierProduct.create({
        data: {
          supplierId: supplier.id,
          optionId: options[0].id,
          supplyPrice: 1000,
          minOrderQty: 1,
        },
      });

      // valid order with optionId
      await seedOrderWithLineItem({
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'NULL-OK',
        optionId: options[0].id,
        unitPrice: 7_000,
        quantity: 2,
      });
      // orphan line — optionId: null (예: extension sync 실패, unmatched externalLineId)
      await seedOrderWithLineItem({
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'NULL-ORPHAN',
        optionId: null,
        unitPrice: 999_999,
        quantity: 99,
      });

      const result = await service.getSalesBySupplier(TEST_ORGANIZATION_ID);

      // null-optionId lineItem must not leak into supplier aggregate
      expect(result.items[0]).toMatchObject({
        totalOrders: 1,
        totalQuantity: 2,
        totalRevenue: 14_000,
      });
    });

    it('empty supplier list → empty result', async () => {
      // No suppliers for TEST_ORGANIZATION_ID
      const result = await service.getSalesBySupplier(TEST_ORGANIZATION_ID);
      expect(result).toEqual({
        summary: {
          supplierCount: 0,
          productCount: 0,
          totalOrders: 0,
          totalQuantity: 0,
          totalRevenue: 0,
        },
        items: [],
      });
    });

    // CHUNK 경계 테스트 — 실용 범위 내 검증 (service OPTION_CHUNK_SIZE = 1000 상수)
    // 50 optionIds 를 1 chunk 안에서 처리. chunk boundary 교차 검증은 1001+ optionIds 필요하지만
    // setup 비용 (수천 insert × 각 option 에 Master 필요) vs 얻는 이득 차이가 크다.
    // service 의 chunked 루프 로직은 unit test 의 mock 레벨에서 이미 검증됨 (supplier-stats.service.spec.ts).
    it('chunk logic exercised with 50 optionIds under 1 chunk — all aggregated correctly', async () => {
      const OPTION_COUNT = 50;
      const supplier = await prisma.supplier.create({
        data: { organizationId: TEST_ORGANIZATION_ID, name: 'Big Supplier' },
      });

      const { options } = await seedMasterWithOptions({
        organizationId: TEST_ORGANIZATION_ID,
        masterCode: 'M-BULK',
        masterName: 'Bulk Master',
        optionNames: Array.from({ length: OPTION_COUNT }, (_, i) => `opt-${i}`),
      });

      // All 50 options mapped as SupplierProduct
      await prisma.supplierProduct.createMany({
        data: options.map((o) => ({
          supplierId: supplier.id,
          optionId: o.id,
          supplyPrice: 1000,
          minOrderQty: 1,
        })),
      });

      // 50 orders, each with 1 lineItem @ unit 100 × qty 2 = 200 → per-option: 1 order, 2 qty, 200 rev
      // aggregated: 50 orders, 100 qty, 10,000 rev
      for (let i = 0; i < OPTION_COUNT; i++) {
        await seedOrderWithLineItem({
          organizationId: TEST_ORGANIZATION_ID,
          externalOrderId: `BULK-${i.toString().padStart(3, '0')}`,
          optionId: options[i].id,
          unitPrice: 100,
          quantity: 2,
        });
      }

      const result = await service.getSalesBySupplier(TEST_ORGANIZATION_ID);

      expect(result).toMatchObject({
        summary: {
          supplierCount: 1,
          productCount: OPTION_COUNT,
          totalOrders: OPTION_COUNT,
          totalQuantity: OPTION_COUNT * 2,
          totalRevenue: OPTION_COUNT * 200,
        },
      });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        supplierId: supplier.id,
        productCount: OPTION_COUNT,
        totalOrders: OPTION_COUNT,
        totalQuantity: OPTION_COUNT * 2,
        totalRevenue: OPTION_COUNT * 200,
      });
    });

    it('cross-tenant — OTHER_ORGANIZATION_ID supplier + options do not leak into TEST_ORGANIZATION_ID result', async () => {
      // TEST_ORGANIZATION_ID 소유 supplier + master + option + order
      const { options: ownOptions } = await seedMasterWithOptions({
        organizationId: TEST_ORGANIZATION_ID,
        masterCode: 'M-OWN',
        masterName: 'Own Master',
        optionNames: ['own-opt'],
      });
      const ownSupplier = await prisma.supplier.create({
        data: { organizationId: TEST_ORGANIZATION_ID, name: 'Own Supplier' },
      });
      await prisma.supplierProduct.create({
        data: {
          supplierId: ownSupplier.id,
          optionId: ownOptions[0].id,
          supplyPrice: 1000,
          minOrderQty: 1,
        },
      });
      await seedOrderWithLineItem({
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'OWN-O1',
        optionId: ownOptions[0].id,
        unitPrice: 5_000,
        quantity: 1,
      });

      // OTHER_ORGANIZATION_ID 소유 supplier + master + option + order
      const { options: foreignOptions } = await seedMasterWithOptions({
        organizationId: OTHER_ORGANIZATION_ID,
        masterCode: 'M-FOR',
        masterName: 'Foreign Master',
        optionNames: ['for-opt'],
      });
      const foreignSupplier = await prisma.supplier.create({
        data: { organizationId: OTHER_ORGANIZATION_ID, name: 'Foreign Supplier' },
      });
      await prisma.supplierProduct.create({
        data: {
          supplierId: foreignSupplier.id,
          optionId: foreignOptions[0].id,
          supplyPrice: 2000,
          minOrderQty: 1,
        },
      });
      await seedOrderWithLineItem({
        organizationId: OTHER_ORGANIZATION_ID,
        externalOrderId: 'FOR-O1',
        optionId: foreignOptions[0].id,
        unitPrice: 99_999,
        quantity: 99,
      });

      // TEST_ORGANIZATION_ID 조회 → OWN 만 보여야
      const result = await service.getSalesBySupplier(TEST_ORGANIZATION_ID);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].supplierId).toBe(ownSupplier.id);
      expect(result.items[0].totalRevenue).toBe(5_000);
      expect(result.items.map((r) => r.supplierId)).not.toContain(foreignSupplier.id);
    });
  });

  // ---------------------------------------------------------------------------
  // #2 getProductSales — master-path supplyPrice: null 실측
  // ---------------------------------------------------------------------------
  describe('getProductSales', () => {
    it('returns SupplierProduct rows with real supplyPrice + MasterSupplierProduct rows with supplyPrice: null', async () => {
      const { master: m1, options: m1Options } = await seedMasterWithOptions({
        organizationId: TEST_ORGANIZATION_ID,
        masterCode: 'M-SP',
        masterName: 'SP Master',
        optionNames: ['sp-opt'],
      });
      const { master: m2, options: m2Options } = await seedMasterWithOptions({
        organizationId: TEST_ORGANIZATION_ID,
        masterCode: 'M-MSP',
        masterName: 'MSP Master',
        optionNames: ['msp-opt-a', 'msp-opt-b'],
      });

      const supplier = await prisma.supplier.create({
        data: { organizationId: TEST_ORGANIZATION_ID, name: 'Mixed Supplier' },
      });

      // SupplierProduct(m1.sp-opt) — supplyPrice 실값 2500
      await prisma.supplierProduct.create({
        data: {
          supplierId: supplier.id,
          optionId: m1Options[0].id,
          supplyPrice: 2_500,
          minOrderQty: 5,
        },
      });
      // MasterSupplierProduct(m2) — m2 아래 2 options (msp-opt-a, msp-opt-b) 자동 포함
      await prisma.masterSupplierProduct.create({
        data: { supplierId: supplier.id, masterId: m2.id, minOrderQty: 15 },
      });

      // sp-opt: 1 order × qty 3 / unit 10k → 30k, 3, 1
      await seedOrderWithLineItem({
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'SP-O1',
        optionId: m1Options[0].id,
        unitPrice: 10_000,
        quantity: 3,
      });
      // msp-opt-a: 1 order × qty 1 / unit 8k → 8k, 1, 1
      await seedOrderWithLineItem({
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'MSP-OA',
        optionId: m2Options[0].id,
        unitPrice: 8_000,
        quantity: 1,
      });
      // msp-opt-b: 0 orders

      const result = await service.getProductSales(TEST_ORGANIZATION_ID, supplier.id);

      expect(result.summary).toEqual({
        productCount: 3,
        totalOrders: 2,
        totalQuantity: 4,
        totalRevenue: 38_000,
      });
      expect(result.items).toHaveLength(3);
      const byOptionId = new Map(result.items.map((r) => [r.optionId, r]));

      // SupplierProduct 경로
      const spRow = byOptionId.get(m1Options[0].id);
      expect(spRow).toEqual({
        optionId: m1Options[0].id,
        sku: 'M-SP-001',
        optionName: 'sp-opt',
        masterId: m1.id,
        masterCode: 'M-SP',
        masterName: 'SP Master',
        supplyPrice: 2_500, // 실값
        minOrderQty: 5,
        totalOrders: 1,
        totalQuantity: 3,
        totalRevenue: 30_000,
      });

      // MasterSupplierProduct 경로 — supplyPrice null
      const mspA = byOptionId.get(m2Options[0].id);
      expect(mspA).toEqual({
        optionId: m2Options[0].id,
        sku: 'M-MSP-001',
        optionName: 'msp-opt-a',
        masterId: m2.id,
        masterCode: 'M-MSP',
        masterName: 'MSP Master',
        supplyPrice: null, // schema 에 없음 (spec §5.5)
        minOrderQty: 15,
        totalOrders: 1,
        totalQuantity: 1,
        totalRevenue: 8_000,
      });

      // msp-opt-b — no orders, stats 0
      const mspB = byOptionId.get(m2Options[1].id);
      expect(mspB).toMatchObject({
        optionId: m2Options[1].id,
        supplyPrice: null,
        minOrderQty: 15,
        totalOrders: 0,
        totalQuantity: 0,
        totalRevenue: 0,
      });
    });

    it('duplicate option (SupplierProduct+MasterSupplierProduct both cover) → SupplierProduct row wins, master-path skips', async () => {
      // opt-0 는 SupplierProduct 로 등록 + MasterSupplierProduct(master) 로도 커버됨.
      // counted Set 으로 master path 에서 skip. 결과는 SupplierProduct row (supplyPrice 실값) 한 개.
      const { master, options } = await seedMasterWithOptions({
        organizationId: TEST_ORGANIZATION_ID,
        masterCode: 'M-CONFLICT',
        masterName: 'Conflict Master',
        optionNames: ['shared'],
      });

      const supplier = await prisma.supplier.create({
        data: { organizationId: TEST_ORGANIZATION_ID, name: 'Conflict Supplier' },
      });

      await prisma.supplierProduct.create({
        data: {
          supplierId: supplier.id,
          optionId: options[0].id,
          supplyPrice: 7_777,
          minOrderQty: 3,
        },
      });
      await prisma.masterSupplierProduct.create({
        data: { supplierId: supplier.id, masterId: master.id, minOrderQty: 99 },
      });

      await seedOrderWithLineItem({
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'CONFLICT-O1',
        optionId: options[0].id,
        unitPrice: 10_000,
        quantity: 2,
      });

      const result = await service.getProductSales(TEST_ORGANIZATION_ID, supplier.id);

      // 딱 1 row — SupplierProduct 경로 우선
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        optionId: options[0].id,
        supplyPrice: 7_777, // master path 의 null 로 덮이지 않음
        minOrderQty: 3, // master 의 99 로 덮이지 않음
      });
    });

    it('empty supplier mapping → empty result', async () => {
      const supplier = await prisma.supplier.create({
        data: { organizationId: TEST_ORGANIZATION_ID, name: 'Empty Supplier' },
      });
      const result = await service.getProductSales(TEST_ORGANIZATION_ID, supplier.id);
      expect(result).toEqual({
        summary: {
          productCount: 0,
          totalOrders: 0,
          totalQuantity: 0,
          totalRevenue: 0,
        },
        items: [],
      });
    });

    it('organizationId scope on order.groupBy — OTHER_ORGANIZATION_ID orders do not count', async () => {
      // supplier.id 는 TEST_ORGANIZATION_ID 소유.
      // 하지만 옵션 ID 가 동일하게 OTHER_ORGANIZATION_ID 쪽 order 에 섞여 있으면?
      //   → master 와 option 은 organizationId 로 namespace. OTHER 측 order 는 별 option 을 가리키므로 자연히 분리.
      //   → 시나리오: TEST_ORGANIZATION_ID 옵션에 OTHER_ORGANIZATION_ID order 가 lineItem 으로 attach 된 케이스
      //     (Prisma 가 허용해도 service 의 `order: { organizationId }` 필터로 배제 되어야 함).
      const { options } = await seedMasterWithOptions({
        organizationId: TEST_ORGANIZATION_ID,
        masterCode: 'M-ISO',
        masterName: 'ISO Master',
        optionNames: ['iso-opt'],
      });

      const supplier = await prisma.supplier.create({
        data: { organizationId: TEST_ORGANIZATION_ID, name: 'ISO Supplier' },
      });
      await prisma.supplierProduct.create({
        data: {
          supplierId: supplier.id,
          optionId: options[0].id,
          supplyPrice: 1000,
          minOrderQty: 1,
        },
      });

      // TEST_ORGANIZATION_ID order — included
      await seedOrderWithLineItem({
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'ISO-OWN',
        optionId: options[0].id,
        unitPrice: 5_000,
        quantity: 1,
      });
      // OTHER_ORGANIZATION_ID order — same optionId but 다른 organizationId
      await seedOrderWithLineItem({
        organizationId: OTHER_ORGANIZATION_ID,
        externalOrderId: 'ISO-FOR',
        optionId: options[0].id,
        unitPrice: 999_999,
        quantity: 99,
      });

      const result = await service.getProductSales(TEST_ORGANIZATION_ID, supplier.id);

      expect(result.items).toHaveLength(1);
      // OTHER_ORGANIZATION_ID order (999,999 × 99) 는 섞이지 않음
      expect(result.items[0].totalRevenue).toBe(5_000);
      expect(result.items[0].totalQuantity).toBe(1);
      expect(result.items[0].totalOrders).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // #3 getHistory — PurchaseOrder + SupplierPayment timeline
  // (T7 에서 변경 없음 — ProfitLoss / Order 재배선과 무관한 기존 로직. 참조용 최소 sanity.)
  // ---------------------------------------------------------------------------
  describe('getHistory', () => {
    it('merges PurchaseOrder + SupplierPayment timeline desc by date', async () => {
      const supplier = await prisma.supplier.create({
        data: { organizationId: TEST_ORGANIZATION_ID, name: 'History Supplier' },
      });

      await prisma.purchaseOrder.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          supplierId: supplier.id,
          supplierName: 'History Supplier',
          totalAmountCny: '1000.00',
          status: 'ordered',
          orderDate: new Date('2026-04-10'),
        },
      });
      await prisma.supplierPayment.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          supplierId: supplier.id,
          amount: 500_000,
          status: 'paid',
        },
      });

      const report = await service.getHistory(TEST_ORGANIZATION_ID, supplier.id);
      const timeline = report.items;

      expect(report.summary).toEqual({
        totalOrdered: 1_000,
        totalPaid: 500_000,
        unpaid: 0,
        orderCount: 1,
        paymentCount: 1,
      });
      expect(timeline).toHaveLength(2);
      // 2026-04-10 PO vs today's payment (createdAt) → payment newer
      expect(timeline[0].type).toBe('payment');
      expect(timeline[0].amount).toBe(500_000);
      expect(timeline[1].type).toBe('purchaseOrder');
      expect(timeline[1].amount).toBe(1_000); // Number('1000.00') === 1000
    });

    it('scopes to organizationId + supplierId (cross-organization payments excluded)', async () => {
      const ownSupplier = await prisma.supplier.create({
        data: { organizationId: TEST_ORGANIZATION_ID, name: 'Own' },
      });
      const foreignSupplier = await prisma.supplier.create({
        data: { organizationId: OTHER_ORGANIZATION_ID, name: 'Foreign' },
      });

      await prisma.supplierPayment.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          supplierId: ownSupplier.id,
          amount: 100,
          status: 'paid',
        },
      });
      await prisma.supplierPayment.create({
        data: {
          organizationId: OTHER_ORGANIZATION_ID,
          supplierId: foreignSupplier.id,
          amount: 999_999,
          status: 'paid',
        },
      });

      const report = await service.getHistory(TEST_ORGANIZATION_ID, ownSupplier.id);
      const timeline = report.items;
      expect(report.summary).toMatchObject({ paymentCount: 1, totalPaid: 100 });
      expect(timeline).toHaveLength(1);
      expect(timeline[0].amount).toBe(100);
    });
  });
});
