import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../prisma/prisma.service';
import type { MulterFile } from '../../common/types';

/**
 * 쿠팡 로켓 발주확정 양식 — 두 가지 경로:
 *  - generateConfirmFile: 발주리스트(거래처확인요청) SKU 행 + KidItem 재고로 업로드
 *    양식 .xlsx 를 **처음부터 직접 생성** (쿠팡 양식 다운로드 불필요).
 *  - fillConfirmTemplate: 쿠팡에서 받은 업로드 양식을 채우는 폴백 경로.
 *
 * 양식 = 시트 `상품목록`(23컬럼) + 시트 `hiddenSheet`(납품부족사유 목록).
 *  확정수량 = min(발주수량, 가용재고), 가용 = ProductOption.barcode →
 *  Inventory(currentStock - reservedStock). 확정 < 발주 이면 납품부족사유 채움.
 */

const SHEET_NAME = '상품목록';
const HIDDEN_SHEET = 'hiddenSheet';

const HEADER = [
  '발주번호', '물류센터', '입고유형', '발주상태', '상품번호', '상품바코드', '상품이름',
  '발주수량', '확정수량', '유통(소비)기한', '제조일자', '생산년도', '납품부족사유',
  '회송담당자', '회송담당자 연락처', '회송지주소', '매입가', '공급가', '부가세',
  '총발주 매입금', '입고예정일', '발주등록일시', 'Xdock',
];
const COL = { barcode: 5, orderQty: 7, confirmQty: 8, shortageReason: 12 };
const ROCKET_DAILY_LOCK_NAMESPACE = 'rocket-daily-snapshot';

const SHORTAGE_REASONS = [
  '제조사 생산중단 혹은 공급사 취급중단 - 제품 리뉴얼/모델 변경',
  '제조사 생산중단 혹은 공급사 취급중단 - 시장 단종',
  '제조사 생산중단 혹은 공급사 취급중단 - 사업자변경',
  '협력사 재고부족 - 수요예측 오류',
  '협력사 재고부족 - 생산캐파 부족 (설비라인/원자재/인력/휴무… 등등)',
  '협력사 재고부족 - 품질적 이슈 (유해물질 발견 / 유통기한 미달)',
  '협력사 재고부족 - 재고 할당정책',
  '협력사 재고부족 - 수입상품 입고지연 (선적/통관지연)',
  'FC 입고기준 미달로 회송',
  '가격 이슈 (Price) - 매입가 인하 협상 중',
  '가격 이슈 (Price) - 매입가 인상 협상 중',
  '가격 이슈 (Price) - 쿠팡 최저가 매칭',
  '최소발주량 변경 필요 (MOQ)',
  '쿠팡 요청 미납',
  '시즌상품으로 다음 시즌전까지 생산 혹은 취급중단',
  '천재지변/재난과 같은 불가항력적인 사유로 미납',
  '업체 휴무',
  '재무 관련 사유',
  'FC 입고 이슈 - FC 슬롯 예약 불가',
  'FC 입고 이슈 - 밀크런 예약불가',
];
const DEFAULT_SHORTAGE_REASON = '협력사 재고부족 - 수요예측 오류';

/** 발주리스트에서 직접 양식을 생성할 때의 SKU 행 입력 (확정수량/사유 제외 — 계산됨). */
export interface ConfirmSourceRow {
  poNumber: string;
  center?: string;
  inboundType?: string;
  poStatus?: string;
  vendorName?: string;
  productNo?: string;
  barcode: string;
  productName?: string;
  orderQty: number;
  returnManager?: string;
  returnContact?: string;
  returnAddress?: string;
  purchasePrice?: number | string;
  supplyPrice?: number | string;
  vat?: number | string;
  totalPurchase?: number | string;
  expectedInboundDate?: string;
  poRegisteredAt?: string;
  xdock?: string;
  /** 편집 미리보기에서 사용자가 직접 넣은 값 — 있으면 재고 계산 대신 이 값을 씀. */
  confirmQty?: number;
  shortageReason?: string;
}

export interface RocketConfirmFillResult {
  buffer: Buffer;
  fileName: string;
  totalRows: number;
  fullyConfirmed: number;
  shortRows: number;
  matchedSkus: number;
}

export interface ConfirmComputedRow extends ConfirmSourceRow {
  available: number | null; // null = KidItem 재고 매칭 안됨
  inventoryId?: string;
  optionId?: string;
  confirmQty: number;
  shortageReason: string;
}

export interface ConfirmPreviewResult {
  rows: ConfirmComputedRow[];
  totalRows: number;
  fullyConfirmed: number;
  shortRows: number;
  matchedSkus: number;
}

export const ROCKET_SHORTAGE_REASONS = SHORTAGE_REASONS;

type ConfirmQuantityInput = {
  barcode: string;
  orderQty: number;
  requestedConfirmQty?: unknown;
  availabilityByBarcode: Map<string, ConfirmAvailability>;
  remainingByBarcode: Map<string, number>;
};

type ConfirmQuantityResult = {
  available: number | null;
  inventoryId?: string;
  optionId?: string;
  confirmQty: number;
  matched: boolean;
};

type ConfirmAvailability = {
  available: number;
  inventoryId?: string;
  optionId: string;
};

@Injectable()
export class RocketPoConfirmService {
  constructor(private readonly prisma: PrismaService) {}

  /** 가용재고(바코드→qty) 조회. 가용 = currentStock - reservedStock. */
  private async availabilityByBarcode(
    barcodes: string[],
    organizationId: string,
  ): Promise<Map<string, ConfirmAvailability>> {
    const options = await this.prisma.productOption.findMany({
      where: { organizationId, barcode: { in: barcodes }, isDeleted: false },
      select: {
        id: true,
        barcode: true,
        inventory: { select: { id: true, currentStock: true, reservedStock: true } },
      },
    });
    const map = new Map<string, ConfirmAvailability>();
    for (const option of options) {
      if (!option.barcode) continue;
      const inv = option.inventory;
      map.set(option.barcode, {
        available: inv ? Math.max(0, inv.currentStock - inv.reservedStock) : 0,
        inventoryId: inv?.id,
        optionId: option.id,
      });
    }
    return map;
  }

  /** 발주리스트 SKU 행 + 재고로 업로드 양식을 처음부터 생성. */
  async generateConfirmFile(
    rows: ConfirmSourceRow[],
    organizationId: string,
  ): Promise<RocketConfirmFillResult> {
    if (!rows.length) throw new BadRequestException('생성할 발주 행이 없습니다.');
    const barcodes = [...new Set(rows.map((r) => String(r.barcode ?? '').trim()).filter(Boolean))];
    const avail = await this.availabilityByBarcode(barcodes, organizationId);
    await this.persistRocketPurchaseOrders(rows, organizationId);

    const aoa: (string | number)[][] = [HEADER];
    const computed = this.computeConfirmRows(rows, avail);

    for (const r of computed.rows) {
      aoa.push([
        r.poNumber ?? '', r.center ?? '', r.inboundType ?? '', r.poStatus ?? '',
        r.productNo ?? '', r.barcode, r.productName ?? '', r.orderQty, r.confirmQty,
        '', '', '', r.shortageReason,
        r.returnManager ?? '', r.returnContact ?? '', r.returnAddress ?? '',
        r.purchasePrice ?? '', r.supplyPrice ?? '', r.vat ?? '', r.totalPurchase ?? '',
        r.expectedInboundDate ?? '', r.poRegisteredAt ?? '', r.xdock ?? 'N',
      ]);
    }

    return {
      ...this.workbookToResult(aoa),
      totalRows: rows.length,
      fullyConfirmed: computed.fullyConfirmed,
      shortRows: computed.shortRows,
      matchedSkus: computed.matchedSkus,
    };
  }

  /** 발주리스트 SKU 행 + 재고 → 확정수량/사유 계산해서 편집 미리보기용 JSON 반환. */
  async previewConfirmRows(
    rows: ConfirmSourceRow[],
    organizationId: string,
  ): Promise<ConfirmPreviewResult> {
    if (!rows.length) throw new BadRequestException('미리볼 발주 행이 없습니다.');
    const barcodes = [...new Set(rows.map((r) => String(r.barcode ?? '').trim()).filter(Boolean))];
    const avail = await this.availabilityByBarcode(barcodes, organizationId);
    await this.persistRocketPurchaseOrders(rows, organizationId);

    return this.computeConfirmRows(rows, avail);
  }

  /** 쿠팡 업로드 양식(.xlsx)을 받아 확정수량/사유만 채우는 폴백 경로. */
  async fillConfirmTemplate(file: MulterFile, organizationId: string): Promise<RocketConfirmFillResult> {
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(file.buffer, { type: 'buffer' });
    } catch {
      throw new BadRequestException('엑셀 파일을 읽을 수 없습니다.');
    }
    const sheet = workbook.Sheets[SHEET_NAME];
    if (!sheet) throw new BadRequestException(`'${SHEET_NAME}' 시트가 없습니다.`);
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '', raw: false });
    if (rows.length < 2) throw new BadRequestException('발주 행이 없습니다.');
    if (rows[0][COL.barcode] !== '상품바코드' || rows[0][COL.confirmQty] !== '확정수량') {
      throw new BadRequestException('양식 형식이 올바르지 않습니다.');
    }
    const barcodes = [
      ...new Set(rows.slice(1).map((r) => String(r[COL.barcode] ?? '').trim()).filter(Boolean)),
    ];
    const avail = await this.availabilityByBarcode(barcodes, organizationId);

    let fullyConfirmed = 0;
    let shortRows = 0;
    let matchedSkus = 0;
    const remaining = new Map([...avail].map(([barcode, match]) => [barcode, match.available]));
    for (let i = 1; i < rows.length; i++) {
      const barcode = String(rows[i][COL.barcode] ?? '').trim();
      if (!barcode) continue;
      const orderQty = toQuantity(rows[i][COL.orderQty]);
      const { confirmQty, matched } = computeConfirmQuantity({
        barcode,
        orderQty,
        availabilityByBarcode: avail,
        remainingByBarcode: remaining,
      });
      if (matched) matchedSkus++;
      sheet[XLSX.utils.encode_cell({ r: i, c: COL.confirmQty })] = { t: 'n', v: confirmQty };
      const reasonAddr = XLSX.utils.encode_cell({ r: i, c: COL.shortageReason });
      if (confirmQty < orderQty) {
        sheet[reasonAddr] = { t: 's', v: DEFAULT_SHORTAGE_REASON };
        shortRows++;
      } else {
        sheet[reasonAddr] = { t: 's', v: '' };
        fullyConfirmed++;
      }
    }
    const out = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    return {
      buffer: Buffer.from(out),
      fileName: `발주확정_${ymd()}.xlsx`,
      totalRows: rows.length - 1,
      fullyConfirmed,
      shortRows,
      matchedSkus,
    };
  }

  private computeConfirmRows(
    rows: ConfirmSourceRow[],
    availabilityByBarcode: Map<string, ConfirmAvailability>,
  ): ConfirmPreviewResult {
    const remainingByBarcode = new Map(
      [...availabilityByBarcode].map(([barcode, match]) => [barcode, match.available]),
    );
    let fullyConfirmed = 0;
    let shortRows = 0;
    let matchedSkus = 0;
    const computed = rows.map((r) => {
      const barcode = String(r.barcode ?? '').trim();
      const orderQty = toQuantity(r.orderQty);
      const { available, inventoryId, optionId, confirmQty, matched } = computeConfirmQuantity({
        barcode,
        orderQty,
        requestedConfirmQty: r.confirmQty,
        availabilityByBarcode,
        remainingByBarcode,
      });
      if (matched) matchedSkus++;
      const shortageReason = normalizeShortageReason(r.shortageReason, confirmQty, orderQty);
      if (confirmQty < orderQty) shortRows++;
      else fullyConfirmed++;
      return {
        ...r,
        barcode,
        orderQty,
        available,
        inventoryId,
        optionId,
        confirmQty,
        shortageReason,
      } satisfies ConfirmComputedRow;
    });
    return { rows: computed, totalRows: rows.length, fullyConfirmed, shortRows, matchedSkus };
  }

  private async persistRocketPurchaseOrders(
    rows: ConfirmSourceRow[],
    organizationId: string,
  ): Promise<void> {
    const summaries = buildRocketPurchaseOrderSummaries(rows);
    if (summaries.length === 0) return;

    const affectedDates = new Map<string, Date>();
    const orderedSummaries = [...summaries].sort((a, b) => a.poSeq - b.poSeq);
    for (const summary of orderedSummaries) {
      affectedDates.set(summary.businessDate.toISOString().slice(0, 10), summary.businessDate);
    }
    const orderedAffectedDates = [...affectedDates.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([dateKey, businessDate]) => ({ dateKey, businessDate }));

    await this.prisma.$transaction(async (tx) => {
      for (const { dateKey } of orderedAffectedDates) {
        await this.lockRocketDailySnapshot(tx, organizationId, dateKey);
      }
      for (const summary of orderedSummaries) {
        await tx.rocketPurchaseOrder.upsert({
          where: {
            organizationId_poSeq: {
              organizationId,
              poSeq: summary.poSeq,
            },
          },
          create: {
            organizationId,
            poSeq: summary.poSeq,
            businessDate: summary.businessDate,
            orderedAt: summary.orderedAt,
            status: summary.status,
            vendorName: summary.vendorName,
            centerName: summary.centerName,
            firstSkuName: summary.firstSkuName,
            skuCount: summary.skuCount,
            orderQty: summary.orderQty,
            orderAmount: summary.orderAmount,
            items: summary.items,
          },
          update: {
            businessDate: summary.businessDate,
            orderedAt: summary.orderedAt,
            status: summary.status,
            vendorName: summary.vendorName,
            centerName: summary.centerName,
            firstSkuName: summary.firstSkuName,
            skuCount: summary.skuCount,
            orderQty: summary.orderQty,
            orderAmount: summary.orderAmount,
            items: summary.items,
          },
        });
      }

      await this.refreshRocketDailySnapshots(
        tx,
        organizationId,
        orderedAffectedDates.map(({ businessDate }) => businessDate),
      );
    });
  }

  private async lockRocketDailySnapshot(
    tx: Prisma.TransactionClient,
    organizationId: string,
    businessDateKey: string,
  ): Promise<void> {
    await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(
        hashtext(${ROCKET_DAILY_LOCK_NAMESPACE}),
        hashtext(${`${organizationId}:${businessDateKey}`})
      ) AS organization_id_scoped_lock
    `;
  }

  private async refreshRocketDailySnapshots(
    tx: Prisma.TransactionClient,
    organizationId: string,
    businessDates: Date[],
  ): Promise<void> {
    for (const businessDate of businessDates) {
      const orders = await tx.rocketPurchaseOrder.findMany({
        where: { organizationId, businessDate },
        select: { poSeq: true, orderAmount: true, orderQty: true },
      });
      const totals = orders.reduce(
        (acc, order) => ({
          revenueKrw: acc.revenueKrw + order.orderAmount,
          itemQty: acc.itemQty + order.orderQty,
          poSeqs: [...acc.poSeqs, order.poSeq],
        }),
        { revenueKrw: 0, itemQty: 0, poSeqs: [] as number[] },
      );
      await tx.rocketSupplyDailySnapshot.upsert({
        where: {
          organizationId_businessDate: {
            organizationId,
            businessDate,
          },
        },
        create: {
          organizationId,
          businessDate,
          revenueKrw: totals.revenueKrw,
          poCount: orders.length,
          itemQty: totals.itemQty,
          source: 'rocket',
          rawJson: { poSeqs: totals.poSeqs, source: 'rocket-po-confirm' },
        },
        update: {
          revenueKrw: totals.revenueKrw,
          poCount: orders.length,
          itemQty: totals.itemQty,
          source: 'rocket',
          rawJson: { poSeqs: totals.poSeqs, source: 'rocket-po-confirm' },
        },
      });
    }
  }

  private workbookToResult(aoa: (string | number)[][]): { buffer: Buffer; fileName: string } {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const hidden = XLSX.utils.aoa_to_sheet(SHORTAGE_REASONS.map((r) => [r]));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, SHEET_NAME);
    XLSX.utils.book_append_sheet(wb, hidden, HIDDEN_SHEET);
    const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return { buffer: Buffer.from(out), fileName: `발주확정_${ymd()}.xlsx` };
  }
}

function computeConfirmQuantity({
  barcode,
  orderQty,
  requestedConfirmQty,
  availabilityByBarcode,
  remainingByBarcode,
}: ConfirmQuantityInput): ConfirmQuantityResult {
  const match = availabilityByBarcode.get(barcode);
  if (match === undefined) return { available: null, confirmQty: 0, matched: false };

  const remaining = Math.max(0, remainingByBarcode.get(barcode) ?? 0);
  const requested =
    requestedConfirmQty === undefined
      ? Math.min(orderQty, remaining)
      : toQuantity(requestedConfirmQty);
  const confirmQty = Math.min(orderQty, remaining, requested);
  remainingByBarcode.set(barcode, remaining - confirmQty);
  return {
    available: match.available,
    inventoryId: match.inventoryId,
    optionId: match.optionId,
    confirmQty,
    matched: true,
  };
}

function normalizeShortageReason(value: unknown, confirmQty: number, orderQty: number): string {
  if (confirmQty >= orderQty) return '';
  const reason = typeof value === 'string' ? value.trim() : '';
  return SHORTAGE_REASONS.includes(reason) ? reason : DEFAULT_SHORTAGE_REASON;
}

type RocketPurchaseOrderSummary = {
  poSeq: number;
  businessDate: Date;
  orderedAt: Date;
  status: string | null;
  vendorName: string | null;
  centerName: string | null;
  firstSkuName: string | null;
  skuCount: number;
  orderQty: number;
  orderAmount: number;
  items: RocketPurchaseOrderItem[];
};

type RocketPurchaseOrderItem = {
  name: string;
  qty: number;
  unitPrice: number;
  amount: number;
  productNo: string;
  barcode: string;
};

function buildRocketPurchaseOrderSummaries(rows: ConfirmSourceRow[]): RocketPurchaseOrderSummary[] {
  const groups = new Map<number, ConfirmSourceRow[]>();
  for (const row of rows) {
    const poSeq = parsePoSeq(row.poNumber);
    if (poSeq === null) continue;
    groups.set(poSeq, [...(groups.get(poSeq) ?? []), row]);
  }

  const summaries: RocketPurchaseOrderSummary[] = [];
  for (const [poSeq, poRows] of groups) {
    const first = poRows[0];
    if (!first) continue;
    const businessDate = parseBusinessDate(first.expectedInboundDate) ?? parseBusinessDate(first.poRegisteredAt);
    if (!businessDate) continue;
    const orderedAt = parseOrderedAt(first.poRegisteredAt) ?? businessDate;
    const items = poRows.map((row) => {
      const qty = toQuantity(row.orderQty);
      const amount = toMoney(row.totalPurchase);
      return {
        name: cleanText(row.productName),
        qty,
        unitPrice: toMoney(row.purchasePrice) || toMoney(row.supplyPrice),
        amount,
        productNo: cleanText(row.productNo),
        barcode: cleanText(row.barcode),
      };
    });
    summaries.push({
      poSeq,
      businessDate,
      orderedAt,
      status: nullableText(first.poStatus),
      vendorName: nullableText(first.vendorName),
      centerName: nullableText(first.center),
      firstSkuName: nullableText(items.find((item) => item.name)?.name),
      skuCount: poRows.length,
      orderQty: items.reduce((sum, item) => sum + item.qty, 0),
      orderAmount: items.reduce((sum, item) => sum + item.amount, 0),
      items,
    });
  }
  return summaries;
}

function parsePoSeq(value: unknown): number | null {
  const raw = String(value ?? '').trim();
  if (!/^\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseBusinessDate(value: unknown): Date | null {
  const raw = String(value ?? '').trim();
  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  const dashed = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const parts = compact ?? dashed;
  if (!parts) return null;
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}

function parseOrderedAt(value: unknown): Date | null {
  const raw = String(value ?? '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const date = new Date(Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]) - 9,
    Number(match[5]),
    Number(match[6] ?? 0),
  ));
  return Number.isNaN(date.getTime()) ? null : date;
}

function toMoney(value: unknown): number {
  return toQuantity(value);
}

function cleanText(value: unknown): string {
  return String(value ?? '').trim();
}

function nullableText(value: unknown): string | null {
  const text = cleanText(value);
  return text ? text : null;
}

function toQuantity(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
  }
  const parsed = parseInt(String(value ?? '').replace(/[^0-9-]/g, ''), 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function ymd(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}
