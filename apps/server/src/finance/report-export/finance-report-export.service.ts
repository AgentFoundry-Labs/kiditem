import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import {
  ADVERTISING_HUB_READ_PORT,
  type AdvertisingHubReadPort,
} from '../../advertising/application/port/in/advertising-hub-read.port';
import {
  CHANNEL_LISTING_REPORT_READ_PORT,
  type ChannelListingReportReadPort,
} from '../../channels/application/port/in/channel-listing-report-read.port';
import {
  PRODUCT_SOURCE_SNAPSHOT_PORT,
  type ProductSourceSnapshotItem,
  type ProductSourceSnapshotPort,
} from '../../products/application/port/in/product-source-snapshot.port';
import { kstBusinessDate } from '../../common/kst';
import { ProfitLossService } from '../services/profit-loss.service';
import type { AdsHubData, AdsListItem } from '@kiditem/shared/advertising';
import type { PLData } from '@kiditem/shared/finance';
import type {
  FinanceReportSurface,
  FinanceReportType,
  ReportExportQueryDto,
} from '../dto/report-export-query.dto';
import type {
  ProfitLossExportQueryDto,
  ProfitLossFilter,
  ProfitLossSortField,
} from '../dto/profit-loss-export-query.dto';

export const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' as const;

export type FinanceReportExportResult = {
  buffer: Buffer;
  fileName: string;
  contentType: typeof XLSX_CONTENT_TYPE;
};

type ReportData = {
  products: Awaited<ReturnType<ChannelListingReportReadPort['list']>>['items'];
  profitLoss: PLData[];
  inventory: ProductSourceSnapshotItem[];
  ads: AdsHubData;
};

/**
 * Server-owned, transient workbooks for the fixed Finance/Analytics reports.
 *
 * There is intentionally no generic workbook payload here: each route selects
 * one of the existing report shapes and maps owner read models to the
 * historical sheet/column contract.
 */
@Injectable()
export class FinanceReportExportService {
  constructor(
    private readonly profitLoss: ProfitLossService,
    @Inject(CHANNEL_LISTING_REPORT_READ_PORT)
    private readonly listings: ChannelListingReportReadPort,
    @Inject(PRODUCT_SOURCE_SNAPSHOT_PORT)
    private readonly inventory: ProductSourceSnapshotPort,
    @Inject(ADVERTISING_HUB_READ_PORT)
    private readonly advertising: AdvertisingHubReadPort,
  ) {}

  async exportReport(
    organizationId: string,
    query: Pick<ReportExportQueryDto, 'type' | 'period' | 'surface'>,
    now: Date,
  ): Promise<FinanceReportExportResult> {
    const data = await this.readReportData(organizationId, query.type, query.period, now);
    const workbook = XLSX.utils.book_new();

    if (query.type === 'full' || query.type === 'products') {
      appendSheet(workbook, '상품목록', data.products.map(toProductReportRow));
    }
    if (query.type === 'full' || query.type === 'profitloss') {
      appendSheet(workbook, '손익표', data.profitLoss.map(toCombinedProfitLossRow));
    }
    if (query.type === 'full' || query.type === 'inventory') {
      appendSheet(workbook, '재고현황', data.inventory.map(toInventoryReportRow));
    }
    if (query.type === 'full' || query.type === 'ads') {
      appendSheet(workbook, '광고현황', data.ads.products.map(toAdvertisingReportRow));
    }

    if (!hasReportData(query.type, data)) {
      throw new BadRequestException('다운로드할 데이터가 없습니다.');
    }

    return {
      buffer: writeWorkbook(workbook),
      fileName: combinedFileName(query.type, query.surface ?? 'reports', query.period),
      contentType: XLSX_CONTENT_TYPE,
    };
  }

  async exportProfitLoss(
    organizationId: string,
    query: ProfitLossExportQueryDto,
    now: Date,
  ): Promise<FinanceReportExportResult> {
    const { year, month } = resolvePeriod(query.period, now);
    const { rows } = await this.profitLoss.findAll(organizationId, year, month, now);
    const filtered = filterAndSortProfitLoss(rows, query);
    const workbook = XLSX.utils.book_new();
    appendSheet(workbook, '손익표', filtered.map(toProfitLossPageRow));

    return {
      buffer: writeWorkbook(workbook),
      fileName: `손익표_${query.period ?? formatPeriod(year, month)}.xlsx`,
      contentType: XLSX_CONTENT_TYPE,
    };
  }

  private async readReportData(
    organizationId: string,
    type: FinanceReportType,
    period: string | undefined,
    now: Date,
  ): Promise<ReportData> {
    const shouldRead = {
      products: type === 'full' || type === 'products',
      profitLoss: type === 'full' || type === 'profitloss',
      inventory: type === 'full' || type === 'inventory',
      ads: type === 'full' || type === 'ads',
    };

    const productsPromise: Promise<ReportData['products']> = shouldRead.products
      ? this.listAllProducts(organizationId)
      : Promise.resolve([]);
    const profitLossPromise: Promise<PLData[]> = shouldRead.profitLoss
      ? this.listProfitLoss(organizationId, period, now)
      : Promise.resolve([]);
    const inventoryPromise: Promise<ProductSourceSnapshotItem[]> = shouldRead.inventory
      ? this.listAllInventory(organizationId)
      : Promise.resolve([]);
    const adsPromise: Promise<AdsHubData> = shouldRead.ads
      ? this.advertising.getHubData(organizationId)
      : Promise.resolve(emptyAdsHub());
    const [products, profitLoss, inventory, ads] = await Promise.all([
      productsPromise,
      profitLossPromise,
      inventoryPromise,
      adsPromise,
    ]);

    return { products, profitLoss, inventory, ads };
  }

  private async listAllProducts(organizationId: string) {
    const pageSize = 100;
    const first = await this.listings.list(organizationId, {
      page: 1,
      limit: pageSize,
      sort: 'newest',
      tab: 'registered',
    });
    const items = [...first.items];
    const totalPages = Math.ceil(first.total / pageSize);
    for (let page = 2; page <= totalPages; page += 1) {
      const next = await this.listings.list(organizationId, {
        page,
        limit: pageSize,
        sort: 'newest',
        tab: 'registered',
      });
      items.push(...next.items);
    }
    if (items.length < first.total) {
      throw new BadRequestException('상품 엑셀 데이터를 끝까지 조회하지 못했습니다. 다시 시도해주세요.');
    }
    return items.slice(0, first.total);
  }

  private async listAllInventory(organizationId: string): Promise<ProductSourceSnapshotItem[]> {
    const pageSize = 200;
    const first = await this.inventory.listSnapshot(organizationId, {
      page: 1,
      limit: pageSize,
    });
    const items = [...first.items];
    const totalPages = Math.ceil(first.total / pageSize);
    for (let page = 2; page <= totalPages; page += 1) {
      const next = await this.inventory.listSnapshot(organizationId, {
        page,
        limit: pageSize,
      });
      items.push(...next.items);
    }
    if (items.length < first.total) {
      throw new BadRequestException('재고 엑셀 데이터를 끝까지 조회하지 못했습니다. 다시 시도해주세요.');
    }
    return items.slice(0, first.total);
  }

  private async listProfitLoss(organizationId: string, period: string | undefined, now: Date) {
    const { year, month } = resolvePeriod(period, now);
    return (await this.profitLoss.findAll(organizationId, year, month, now)).rows;
  }
}

function appendSheet(
  workbook: XLSX.WorkBook,
  name: string,
  rows: Record<string, unknown>[],
): void {
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), name);
}

function writeWorkbook(workbook: XLSX.WorkBook): Buffer {
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
}

function toProductReportRow(product: ReportData['products'][number]) {
  return {
    마켓: product.channel,
    계정: product.channelAccountName,
    등록상품명: product.listingName,
    채널상품명: product.channelName,
    외부상품번호: product.externalId,
    판매가: product.channelPrice,
    상태: product.status,
    노출상태: product.exposureStatus,
    옵션수: product.optionCount,
    재고매칭상태: product.mappingStatus,
  };
}

function toCombinedProfitLossRow(row: PLData) {
  return {
    등급: row.grade,
    상품명: row.masterName,
    셀피아상품코드: row.masterCode,
    채널: row.channelName ?? '',
    매출: row.revenue,
    매입원가: row.cogs,
    수수료: row.commission,
    배송비: row.shippingCost,
    광고비: row.adCost,
    기타비용: row.otherCost,
    순이익: row.netProfit,
    '이익률(%)': row.profitRate,
    주문수: row.orderCount,
  };
}

function toProfitLossPageRow(row: PLData) {
  return {
    등급: row.grade,
    상품명: row.masterName,
    SKU: row.masterCode,
    채널: row.channelName ?? '',
    매출: row.revenue,
    매입원가: row.cogs,
    수수료: row.commission,
    배송비: row.shippingCost,
    광고비: row.adCost,
    기타비용: row.otherCost,
    순이익: row.netProfit,
    '이익률(%)': row.profitRate,
    주문수: row.orderCount,
  };
}

function toInventoryReportRow(item: ProductSourceSnapshotItem) {
  return {
    셀피아상품코드: item.code,
    상품명: item.name,
    옵션: item.optionName,
    바코드: item.barcode,
    현재고: item.currentStock,
    매입가: item.purchasePrice,
    재고자산가치: item.stockValue,
    최근반영: item.lastImportedAt,
  };
}

function toAdvertisingReportRow(item: AdsListItem) {
  return {
    등급: item.grade,
    상품명: item.channelName ?? item.masterProduct.name,
    셀피아상품코드: item.masterProduct.code,
    광고비: item.metrics.spend,
    광고매출: item.metrics.revenue,
    'ROAS(%)': item.metrics.roas,
    'CTR(%)': item.metrics.ctr,
    '전환율(%)': item.metrics.cvr,
  };
}

function filterAndSortProfitLoss(
  rows: PLData[],
  query: Pick<ProfitLossExportQueryDto, 'profitFilter' | 'grades' | 'sortField' | 'sortDirection'>,
): PLData[] {
  const profitFilter: ProfitLossFilter = query.profitFilter ?? 'all';
  const grades = query.grades?.split(',') ?? [];
  const filtered = rows.filter((row) => {
    // A row whose profit is unavailable (ADR-0003) is not known to be
    // loss-making, low-margin or healthy, so it answers none of the three
    // profit filters. Only the unfiltered export still carries it.
    const matchesProfit = profitFilter === 'minus'
      ? row.profitRate !== null && row.profitRate < 0
      : profitFilter === 'low'
        ? row.profitRate !== null && row.profitRate >= 0 && row.profitRate <= 3
        : profitFilter === 'normal'
          ? row.profitRate !== null && row.profitRate > 3
          : true;
    const matchesGrade = grades.length === 0
      || grades.includes((row.grade ?? '').toUpperCase());
    return matchesProfit && matchesGrade;
  });

  if (!query.sortField || !query.sortDirection) return filtered;
  const sortField: ProfitLossSortField = query.sortField;
  return [...filtered].sort((left, right) => {
    const a = left[sortField];
    const b = right[sortField];
    if (a === b) return 0;
    // An unavailable value has no position on the scale, so it sorts last in
    // both directions rather than being ordered as if it were a zero.
    if (a === null) return 1;
    if (b === null) return -1;
    return query.sortDirection === 'asc'
      ? (a > b ? 1 : -1)
      : (a < b ? 1 : -1);
  });
}

/** A `YYYY-MM` period, or the KST month containing `now`. */
function resolvePeriod(period: string | undefined, now: Date): { year: number; month: number } {
  if (period) {
    const [year, month] = period.split('-').map(Number);
    return { year, month };
  }
  const today = kstBusinessDate(now);
  return { year: today.getUTCFullYear(), month: today.getUTCMonth() + 1 };
}

function formatPeriod(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function combinedFileName(
  type: FinanceReportType,
  surface: FinanceReportSurface,
  period?: string,
): string {
  const date = new Date().toISOString().slice(0, 10);
  if (surface === 'settings') {
    return type === 'full'
      ? `KIDITEM_통합리포트_${date}.xlsx`
      : `KIDITEM_${type}_리포트_${date}.xlsx`;
  }
  const periodLabel = period || '전체';
  return type === 'full'
    ? `통합리포트_${periodLabel}_${date}.xlsx`
    : `${type}_리포트_${periodLabel}_${date}.xlsx`;
}

function hasReportData(type: FinanceReportType, data: ReportData): boolean {
  if (type === 'full') {
    return data.products.length > 0
      || data.profitLoss.length > 0
      || data.inventory.length > 0
      || data.ads.products.length > 0;
  }
  if (type === 'products') return data.products.length > 0;
  if (type === 'profitloss') return data.profitLoss.length > 0;
  if (type === 'inventory') return data.inventory.length > 0;
  return data.ads.products.length > 0;
}

function emptyAdsHub(): AdsHubData {
  return {
    products: [],
    summary: {
      totalSpend: 0,
      totalRevenue: 0,
      totalRoas: null,
      gradeSpend: { A: 0, B: 0, C: 0 },
      gradeSpendPercent: { A: 0, B: 0, C: 0 },
    },
    abcOfficialCutoffDate: null,
  };
}
