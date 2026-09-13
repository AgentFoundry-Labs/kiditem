import * as XLSX from 'xlsx';
import { describe, expect, it, vi } from 'vitest';
import { FinanceReportExportService } from '../finance-report-export.service';
import type { AdsHubData } from '@kiditem/shared/advertising';
import type { PLData } from '@kiditem/shared/finance';
import type { InventorySkuSnapshotListPort } from '../../../inventory/application/port/in/stock/inventory-sku-snapshot-list.port';
import type { ChannelListingReportReadPort } from '../../../channels/application/port/in/channel-listing-report-read.port';

const ORG = '00000000-0000-4000-8000-000000000001';
const LISTING = '00000000-0000-4000-8000-000000000002';
const MASTER = '00000000-0000-4000-8000-000000000003';

function plRow(overrides: Partial<PLData> = {}): PLData {
  return {
    listingId: LISTING,
    externalId: 'EXT-1',
    channelName: '쿠팡',
    masterId: MASTER,
    masterCode: 'SKU-1',
    masterName: '테스트 상품',
    category: null,
    grade: 'A',
    thumbnailUrl: null,
    revenue: 1000,
    cogs: 400,
    commission: 100,
    shippingCost: 50,
    adCost: 25,
    otherCost: 10,
    netProfit: 415,
    profitRate: 41.5,
    orderCount: 2,
    returnCount: 0,
    ...overrides,
  };
}

function buildService() {
  const profitLoss = { findAll: vi.fn().mockResolvedValue({ rows: [plRow()] }) };
  const settlements = {
    reconcile: vi.fn().mockResolvedValue({
      success: true,
      period: '2026-08',
      summary: {
        totalPlRevenue: 1000,
        totalOrderRevenue: 1000,
        totalCommission: 100,
        totalShipping: 50,
        revenueDifference: 0,
        productCount: 1,
        orderCount: 2,
        matchedCount: 1,
        mismatchCount: 0,
        matchRate: 100,
      },
      details: [{
        listingId: LISTING,
        externalId: 'EXT-1',
        channelName: '쿠팡',
        masterCode: 'SKU-1',
        masterName: '테스트 상품',
        plRevenue: 1000,
        plCommission: 100,
        plNetProfit: 415,
        plOrderCount: 2,
        orderTotal: 1000,
        orderCount: 2,
        revenueDiff: 0,
        isMatched: true,
        status: 'matched',
      }],
    }),
  };
  const listings: ChannelListingReportReadPort = {
    list: vi.fn().mockResolvedValue({
      items: [{
        id: LISTING,
        listingName: '등록 상품',
        thumbnailUrl: null,
        detailPageArtifactId: null,
        detailPageRevisionId: null,
        channel: 'coupang',
        channelAccountId: null,
        channelAccountName: '계정',
        externalId: 'EXT-1',
        channelName: '채널 상품',
        channelPrice: 1200,
        sourceCandidateId: null,
        contentWorkspaceId: null,
        status: 'active',
        exposureStatus: 'exposed',
        optionCount: 1,
        mappingStatus: 'matched',
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      }],
      total: 1,
      page: 1,
      limit: 100,
      marketCounts: [],
    }),
  };
  const inventory: InventorySkuSnapshotListPort = {
    listSnapshot: vi.fn().mockResolvedValue({
      items: [{
        sellpiaInventorySkuId: MASTER,
        code: 'SKU-1',
        name: '테스트 상품',
        optionName: null,
        barcode: null,
        currentStock: 3,
        purchasePrice: 400,
        salePrice: 1200,
        isActive: true,
        stockValue: 1200,
        lastImportRunId: null,
        lastImportedAt: '2026-08-01T00:00:00.000Z',
        linkedChannelOptionCount: 1,
        linkedProductCount: 1,
        linkedProducts: [],
        linkedChannelOptions: [],
        linkStatus: 'linked',
      }],
      total: 1,
      page: 1,
      limit: 200,
      summary: {},
      latestImport: null,
    } as never),
    getSnapshot: vi.fn(),
    listImportRuns: vi.fn(),
  };
  const ads: AdsHubData = {
    products: [{
      listingId: LISTING,
      externalId: 'EXT-1',
      channelName: '채널 상품',
      masterProduct: { id: MASTER, code: 'SKU-1', name: '테스트 상품' },
      option: null,
      metrics: {
        spend: 10,
        impressions: 100,
        clicks: 5,
        conversions: 1,
        revenue: 100,
        ctr: 5,
        roas: 1000,
        cvr: 20,
      },
      grade: 'A',
      tier: '1차',
      adTier: '1차',
    }],
    summary: {
      totalSpend: 10,
      totalRevenue: 100,
      totalRoas: 1000,
      gradeSpend: { A: 10, B: 0, C: 0 },
      tierSpend: { '1차': 10 },
      gradeSpendPercent: { A: 100, B: 0, C: 0 },
    },
  };
  const advertising = { getHubData: vi.fn().mockResolvedValue(ads) };
  const service = new FinanceReportExportService(
    profitLoss as never,
    settlements as never,
    listings,
    inventory,
    advertising,
  );
  return { service, profitLoss, settlements, listings, inventory, advertising };
}

function readWorkbook(buffer: Buffer) {
  return XLSX.read(buffer, { type: 'buffer' });
}

function headerRow(workbook: XLSX.WorkBook, sheetName: string): unknown[] {
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]!, {
    header: 1,
    blankrows: false,
  })[0] as unknown[];
}

describe('FinanceReportExportService', () => {
  it('builds the complete fixed workbook from scoped owner reads', async () => {
    const { service, profitLoss, listings, inventory, advertising } = buildService();

    const result = await service.exportReport(ORG, {
      type: 'full',
      surface: 'reports',
      period: '2026-08',
    });
    const workbook = readWorkbook(result.buffer);

    expect(workbook.SheetNames).toEqual(['상품목록', '손익표', '재고현황', '광고현황']);
    expect(headerRow(workbook, '상품목록')).toEqual([
      '마켓', '계정', '등록상품명', '채널상품명', '외부상품번호', '판매가',
      '상태', '노출상태', '옵션수', '재고매칭상태',
    ]);
    expect(headerRow(workbook, '손익표')).toContain('셀피아상품코드');
    expect(headerRow(workbook, '재고현황')).toContain('재고자산가치');
    expect(headerRow(workbook, '광고현황')).toContain('전환율(%)');
    expect(result.fileName).toMatch(/^통합리포트_2026-08_\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(listings.list).toHaveBeenCalledWith(ORG, expect.objectContaining({ tab: 'registered' }));
    expect(inventory.listSnapshot).toHaveBeenCalledWith(ORG, expect.objectContaining({ activeStatus: 'active' }));
    expect(advertising.getHubData).toHaveBeenCalledWith(ORG);
    expect(profitLoss.findAll).toHaveBeenCalledWith(ORG, 2026, 8);
  });

  it('uses the settings filename and avoids unrelated owner reads for one report', async () => {
    const { service, profitLoss, inventory, advertising } = buildService();
    const result = await service.exportReport(ORG, { type: 'products', surface: 'settings' });
    const workbook = readWorkbook(result.buffer);

    expect(workbook.SheetNames).toEqual(['상품목록']);
    expect(result.fileName).toMatch(/^KIDITEM_products_리포트_\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(profitLoss.findAll).not.toHaveBeenCalled();
    expect(inventory.listSnapshot).not.toHaveBeenCalled();
    expect(advertising.getHubData).not.toHaveBeenCalled();
  });

  it('preserves the P&L page filter, grade, and sort query in the server workbook', async () => {
    const { service, profitLoss } = buildService();
    profitLoss.findAll.mockResolvedValue({
      rows: [
        plRow({ listingId: LISTING, masterCode: 'A-1', grade: 'A', profitRate: -1, revenue: 100 }),
        plRow({ listingId: MASTER, masterCode: 'A-2', grade: 'A', profitRate: 1, revenue: 50 }),
        plRow({ listingId: MASTER, masterCode: 'B-1', grade: 'B', profitRate: -2, revenue: 200 }),
      ],
    });

    const result = await service.exportProfitLoss(ORG, {
      period: '2026-08',
      profitFilter: 'minus',
      grades: 'A',
      sortField: 'revenue',
      sortDirection: 'asc',
    });
    const workbook = readWorkbook(result.buffer);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['손익표']!);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ SKU: 'A-1', 매출: 100 });
    expect(headerRow(workbook, '손익표')).toContain('SKU');
    expect(headerRow(workbook, '손익표')).not.toContain('셀피아상품코드');
  });

  it('converts reconciliation details from the canonical settlement owner response', async () => {
    const { service, settlements } = buildService();
    const result = await service.exportSettlementReconcile(ORG, '2026-08');
    const workbook = readWorkbook(result.buffer);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['정산대사']!);

    expect(settlements.reconcile).toHaveBeenCalledWith(ORG, '2026-08');
    expect(result.fileName).toBe('정산대사_2026-08.xlsx');
    expect(rows[0]).toMatchObject({ 상품명: '테스트 상품', SKU: 'SKU-1', 상태: '매칭' });
    expect(headerRow(workbook, '정산대사')).toEqual([
      '상품명', 'SKU', '손익매출', '주문합계', '차이', '손익건수', '주문건수', '상태',
    ]);
  });
});
