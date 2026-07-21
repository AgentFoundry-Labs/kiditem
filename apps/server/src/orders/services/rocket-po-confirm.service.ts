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
 *  확정수량 = min(발주수량, 가용재고), 가용 = 바코드 →
 *  SellpiaInventorySku.currentStock − Σ(로켓 예약). 확정 < 발주 이면 납품부족사유 채움.
 */

const SHEET_NAME = '상품목록';
const HIDDEN_SHEET = 'hiddenSheet';

const HEADER = [
  '발주번호', '물류센터', '입고유형', '발주상태', '상품번호', '상품바코드', '상품이름',
  '발주수량', '확정수량', '유통(소비)기한', '제조일자', '생산년도', '납품부족사유',
  '회송담당자', '회송담당자 연락처', '회송지주소', '매입가', '공급가', '부가세',
  '총발주 매입금', '입고예정일', '발주등록일시', 'Xdock',
];
const COL = { barcode: 5, name: 6, orderQty: 7, confirmQty: 8, shortageReason: 12 };
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

/**
 * 재고 매칭 방식.
 *  - barcode     : 쿠팡 바코드 == MasterProduct.barcode 정확일치 (가장 신뢰)
 *  - name        : 이름 코어 완전일치/포함 (신뢰)
 *  - name-fuzzy  : 이름 퍼지(LCS/Dice) — 오매칭 가능, 사용자 확인 필요
 *  - null        : 미매칭
 */
export type MatchKind = 'barcode' | 'name' | 'name-fuzzy';

export interface ConfirmComputedRow extends ConfirmSourceRow {
  available: number | null; // null = 재고 매칭 안됨
  matchKind?: MatchKind | null;
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

/** 저장된 로켓 발주 요약(달력/목록용). RocketPurchaseOrder 테이블 1행 = 1발주. */
export interface RocketSavedPoSummary {
  poSeq: number;
  orderedAt: string;
  businessDate: string; // YYYY-MM-DD 입고예정일(KST)
  status: string | null;
  vendorName: string | null;
  centerName: string | null;
  firstSkuName: string | null;
  skuCount: number;
  orderQty: number;
  orderAmount: number;
}

/** RocketPurchaseOrder.items(JSON) 한 항목. */
interface RocketPoItem {
  name?: string;
  qty?: number;
  unitPrice?: number;
  amount?: number;
  productNo?: string;
  barcode?: string;
}

export interface RocketConfirmCommitResult {
  reservedRows: number;
  alreadyReservedRows: number;
  skippedRows: number;
  failedRows: number;
  skipped: Array<{
    poNumber: string;
    productNo: string;
    barcode: string;
    reason: 'zero_confirm_qty' | 'unmatched_inventory';
  }>;
  failed: Array<{
    poNumber: string;
    productNo: string;
    barcode: string;
    reason: string;
  }>;
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
  matchKind: MatchKind | null;
  confirmQty: number;
  matched: boolean;
};

type ConfirmAvailability = {
  available: number;
  kind: MatchKind;
};

/** 이름매칭 인덱스 항목 (MasterProduct.name → 코어/가격/재고). */
type MasterNameEntry = { core: string; price: string | null; stock: number };

@Injectable()
export class RocketPoConfirmService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 가용재고(바코드→qty) 조회. 가용 = 재고(MasterProduct.currentStock) − Σ(로켓 예약).
   *
   * 매칭 캐스케이드 (신뢰순):
   *   ① 쿠팡 바코드 == MasterProduct.barcode 정확일치
   *   ② 실패 시 상품명 코어매칭(normalizeCoupangName → 완전/포함) — 쿠팡·셀피아 바코드가
   *      달라도(예: 카피바라 …4409 vs …4393) 이름이 같으면 재고를 잇는다.
   *   ③ 그래도 실패 시 퍼지(LCS/Dice + 가격가드) — matchKind='name-fuzzy'로 표시(확인 필요).
   *
   * 재고 소스는 셀피아-단일소유 SellpiaInventorySku 하나다(#330 이 MasterProduct.currentStock 과
   * SellpiaProductStock 을 이 모델로 통합):
   *  - 바코드 정확일치 재고는 barcode 로,
   *  - 이름 매칭 폴백 재고·이름은 같은 테이블의 name·currentStock 으로 읽는다.
   * 예약은 RocketPoReservation(쿠팡 바코드 키)에서 뺀다.
   * (이름매칭 로직은 commit 6c4324d5 coupang-catalog.service 의 이식.)
   */
  private async availabilityByBarcode(
    items: Array<{ barcode: string; name?: string | null }>,
    organizationId: string,
  ): Promise<Map<string, ConfirmAvailability>> {
    // 바코드별 대표 이름(가장 긴 것)으로 정리.
    const nameByBarcode = new Map<string, string>();
    for (const it of items) {
      const barcode = String(it.barcode ?? '').trim();
      if (!barcode) continue;
      const name = String(it.name ?? '').trim();
      const prev = nameByBarcode.get(barcode);
      if (prev === undefined || name.length > prev.length) nameByBarcode.set(barcode, name);
    }
    const barcodes = [...nameByBarcode.keys()];
    if (!barcodes.length) return new Map();

    const [sellpiaStocks, masters, reservations] = await Promise.all([
      this.prisma.sellpiaInventorySku.findMany({
        where: { organizationId, barcode: { in: barcodes } },
        select: { barcode: true, currentStock: true },
      }),
      this.prisma.sellpiaInventorySku.findMany({
        where: { organizationId, isActive: true },
        select: { name: true, currentStock: true },
      }),
      this.prisma.rocketPoReservation.groupBy({
        by: ['barcode'],
        where: { organizationId, barcode: { in: barcodes } },
        _sum: { qty: true },
      }),
    ]);

    // ① 바코드 정확일치 재고 = SellpiaInventorySku(같은 바코드 여러 옵션 row 면 합산).
    const stockByBarcode = new Map<string, number>();
    for (const s of sellpiaStocks) {
      const barcode = s.barcode?.trim();
      if (barcode) stockByBarcode.set(barcode, (stockByBarcode.get(barcode) ?? 0) + s.currentStock);
    }
    // ②③ 이름 매칭 인덱스 = SellpiaInventorySku(name·currentStock). 바코드가 안 맞을 때만 사용.
    const nameIndex: MasterNameEntry[] = [];
    for (const m of masters) {
      const core = normalizeCoupangName(m.name);
      if (core.length >= 2) nameIndex.push({ core, price: coupangNamePrice(m.name), stock: m.currentStock });
    }
    const reservedByBarcode = new Map<string, number>(
      reservations.map((r) => [r.barcode, r._sum.qty ?? 0]),
    );

    const map = new Map<string, ConfirmAvailability>();
    for (const [barcode, name] of nameByBarcode) {
      const reserved = reservedByBarcode.get(barcode) ?? 0;
      // ① 바코드 정확일치
      const byBarcode = stockByBarcode.get(barcode);
      if (byBarcode !== undefined) {
        map.set(barcode, { available: Math.max(0, byBarcode - reserved), kind: 'barcode' });
        continue;
      }
      // ② / ③ 이름 매칭 (완전/포함/퍼지)
      const core = normalizeCoupangName(name);
      const nameMatch = matchByName(core, coupangNamePrice(name), nameIndex);
      if (nameMatch) {
        map.set(barcode, {
          available: Math.max(0, nameMatch.stock - reserved),
          kind: nameMatch.fuzzy ? 'name-fuzzy' : 'name',
        });
      }
      // 매칭 실패 → map 에 없음 → 미매칭
    }
    return map;
  }

  /** 발주리스트 SKU 행 + 재고로 업로드 양식을 처음부터 생성. */
  async generateConfirmFile(
    rows: ConfirmSourceRow[],
    organizationId: string,
  ): Promise<RocketConfirmFillResult> {
    if (!rows.length) throw new BadRequestException('생성할 발주 행이 없습니다.');
    const avail = await this.availabilityByBarcode(
      rows.map((r) => ({ barcode: String(r.barcode ?? '').trim(), name: r.productName })),
      organizationId,
    );
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
    const avail = await this.availabilityByBarcode(
      rows.map((r) => ({ barcode: String(r.barcode ?? '').trim(), name: r.productName })),
      organizationId,
    );
    await this.persistRocketPurchaseOrders(rows, organizationId);

    return this.computeConfirmRows(rows, avail);
  }

  /**
   * 저장된 로켓 발주(rocket_purchase_orders)를 입고예정일 범위로 조회 — 달력/목록용.
   * 매번 쿠팡에서 재수집하지 않고 DB 에 쌓인 발주를 그대로 읽는다.
   */
  async listSavedRocketPos(
    input: { from?: string; to?: string },
    organizationId: string,
  ): Promise<RocketSavedPoSummary[]> {
    const where: Prisma.RocketPurchaseOrderWhereInput = { organizationId };
    const range = businessDateRange(input.from, input.to);
    if (range) where.businessDate = range;

    const pos = await this.prisma.rocketPurchaseOrder.findMany({
      where,
      orderBy: [{ businessDate: 'desc' }, { poSeq: 'desc' }],
    });
    return pos.map((po) => ({
      poSeq: po.poSeq,
      orderedAt: po.orderedAt.toISOString(),
      businessDate: toDateKey(po.businessDate),
      status: po.status,
      vendorName: po.vendorName,
      centerName: po.centerName,
      firstSkuName: po.firstSkuName,
      skuCount: po.skuCount,
      orderQty: po.orderQty,
      orderAmount: po.orderAmount,
    }));
  }

  /**
   * 저장된 발주 중 특정 입고예정일 하루치를 셀피아 재고와 매칭해 미리보기 계산.
   * items(JSON, 바코드·수량 포함)로 ConfirmSourceRow 를 재구성하므로 재수집이 필요 없다.
   */
  async previewSavedByDate(
    input: { date: string },
    organizationId: string,
  ): Promise<ConfirmPreviewResult> {
    const range = businessDateRange(input.date, input.date);
    const pos = await this.prisma.rocketPurchaseOrder.findMany({
      where: { organizationId, ...(range ? { businessDate: range } : {}) },
      orderBy: [{ poSeq: 'desc' }],
    });
    const rows = pos.flatMap((po) => reconstructConfirmRows(po));
    if (rows.length === 0) {
      return { rows: [], totalRows: 0, fullyConfirmed: 0, shortRows: 0, matchedSkus: 0 };
    }
    const avail = await this.availabilityByBarcode(
      rows.map((r) => ({ barcode: String(r.barcode ?? '').trim(), name: r.productName })),
      organizationId,
    );
    return this.computeConfirmRows(rows, avail);
  }

  /**
   * 미리보기에서 확정한 수량을 로켓 예약(RocketPoReservation)으로 멱등 기록.
   * sourceActionId(발주번호·상품번호·바코드) 기준 upsert — 재커밋은 alreadyReserved 로 집계.
   * 전용 예약 테이블을 셀피아-단일소유 재고 위에 가산 저장한다(orders 는 셀피아
   * 재고를 읽기만 하고 물리 재고 필드를 직접 변경하지 않는다).
   */
  async commitReservations(
    rows: ConfirmComputedRow[],
    organizationId: string,
  ): Promise<RocketConfirmCommitResult> {
    if (!rows.length) throw new BadRequestException('예약 처리할 발주 행이 없습니다.');

    const result: RocketConfirmCommitResult = {
      reservedRows: 0,
      alreadyReservedRows: 0,
      skippedRows: 0,
      failedRows: 0,
      skipped: [],
      failed: [],
    };
    const seenSourceActionIds = new Set<string>();

    for (const row of rows) {
      const barcode = cleanText(row.barcode);
      const quantity = toQuantity(row.confirmQty);
      if (quantity <= 0) {
        result.skippedRows += 1;
        result.skipped.push(toSkipped(row, 'zero_confirm_qty'));
        continue;
      }
      if (!barcode) {
        result.skippedRows += 1;
        result.skipped.push(toSkipped(row, 'unmatched_inventory'));
        continue;
      }

      const sourceActionId = rocketConfirmSourceActionId(row);
      if (seenSourceActionIds.has(sourceActionId)) {
        result.failedRows += 1;
        result.failed.push(toFailed(row, 'duplicate_source_action'));
        continue;
      }
      seenSourceActionIds.add(sourceActionId);

      try {
        const existing = await this.prisma.rocketPoReservation.findUnique({
          where: { organizationId_sourceActionId: { organizationId, sourceActionId } },
          select: { id: true },
        });
        const data = {
          poNumber: cleanText(row.poNumber),
          productNo: cleanText(row.productNo),
          barcode,
          qty: quantity,
        };
        if (existing) {
          await this.prisma.rocketPoReservation.update({
            where: { organizationId_sourceActionId: { organizationId, sourceActionId } },
            data,
          });
          result.alreadyReservedRows += 1;
        } else {
          await this.prisma.rocketPoReservation.create({
            data: { organizationId, sourceActionId, ...data },
          });
          result.reservedRows += 1;
        }
      } catch (err) {
        result.failedRows += 1;
        result.failed.push(toFailed(row, err instanceof Error ? err.message : 'rocket_reservation_failed'));
      }
    }

    return result;
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
    const avail = await this.availabilityByBarcode(
      rows.slice(1).map((r) => ({ barcode: String(r[COL.barcode] ?? '').trim(), name: String(r[COL.name] ?? '') })),
      organizationId,
    );

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
      const { available, matchKind, confirmQty, matched } = computeConfirmQuantity({
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
        matchKind,
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
    // pg_advisory_xact_lock 은 void 를 반환 → $queryRaw 는 컬럼 역직렬화에서 실패한다.
    // 반환값이 필요 없는 lock 이므로 $executeRaw(실행만, 결과 매핑 없음)를 쓴다.
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(
        hashtext(${ROCKET_DAILY_LOCK_NAMESPACE}),
        hashtext(${`${organizationId}:${businessDateKey}`})
      )
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
  if (match === undefined) return { available: null, matchKind: null, confirmQty: 0, matched: false };

  const remaining = Math.max(0, remainingByBarcode.get(barcode) ?? 0);
  const requested =
    requestedConfirmQty === undefined
      ? Math.min(orderQty, remaining)
      : toQuantity(requestedConfirmQty);
  const confirmQty = Math.min(orderQty, remaining, requested);
  remainingByBarcode.set(barcode, remaining - confirmQty);
  return {
    available: match.available,
    matchKind: match.kind,
    confirmQty,
    matched: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 상품명 매칭 (commit 6c4324d5 coupang-catalog.service 에서 이식 — 순수 함수, 모델 의존 없음)
// 쿠팡 발주 바코드가 셀피아 바코드와 달라도 이름으로 재고를 잇기 위함.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 상품명 → 코어 이름. 브랜드("KY I&D")·패키징(Pack_/Box_)·수량("N개입")·무게·
 * 노이즈(랜덤발송 등)·모든 숫자(앞자리 가격 포함)를 제거한다. 가격은 coupangNamePrice 로 별도 비교.
 */
export function normalizeCoupangName(name: string): string {
  return String(name ?? '')
    .replace(/KY\s*I\s*&?\s*D/gi, ' ') // 브랜드
    .replace(/\b(?:pack|box|set)[_\s]/gi, ' ') // 패키징 접두
    .replace(/\(?\s*\d+\s*개입?\s*\)?/g, ' ') // 수량 "(16개입)", "12개"
    .replace(/\d+\s*세트/g, ' ')
    .replace(/\d+\s*입/g, ' ')
    .replace(/\d+\s*(?:g|kg|ml|cm|mm|호)\b/gi, ' ') // 무게/규격
    .replace(/랜덤발송|혼합색상|색상랜덤|랜덤|쿠팡용|외\s*\d+\s*종/g, ' ')
    .replace(/\d+/g, ' ') // 남은 숫자(가격 포함) 제거 — 코어만
    .replace(/[^가-힣a-zA-Z]/g, '')
    .toLowerCase();
}

/** 상품명 앞 가격(3~6자리, 브랜드접두 뒤) 추출 — 가격만 다른 상품 오매칭 가드용. */
export function coupangNamePrice(name: string): string | null {
  const t = String(name ?? '')
    .replace(/KY\s*I\s*&?\s*D/gi, '')
    .replace(/\b(?:pack|box|set)[_\s]/gi, '')
    .trim();
  const m = t.match(/^(\d{3,6})/);
  return m ? m[1] : null;
}

/**
 * 코어 매칭: 완전일치 → 포함 → 퍼지(LCS) + 가격 가드. 매칭된 재고를 반환.
 * fuzzy=true 는 이름이 갈렸지만 핵심이 크게 겹치는 후보 — 오매칭 가능성이 있어 확인이 더 필요.
 */
function matchByName(
  core: string,
  price: string | null,
  index: MasterNameEntry[],
): { stock: number; fuzzy: boolean } | null {
  if (core.length < 2) return null;
  const compatible = (s: MasterNameEntry) => !(price && s.price && price !== s.price);
  const exact = index.find((s) => s.core === core && compatible(s));
  if (exact) return { stock: exact.stock, fuzzy: false };
  if (core.length < 3) return null;
  const contained = index.find(
    (s) => s.core.length >= 3 && compatible(s) && (core.includes(s.core) || s.core.includes(core)),
  );
  if (contained) return { stock: contained.stock, fuzzy: false };
  // 퍼지: 두 신호 중 하나라도 통과하면 후보(확인 필요).
  //  - 연속 LCS: 접두/접미가 크게 겹침. - Dice bigram: 중간 단어만 치환된 경우.
  if (core.length < 4) return null;
  let best: MasterNameEntry | null = null;
  let bestScore = 0;
  for (const s of index) {
    if (!compatible(s) || s.core.length < 4) continue;
    const minLen = Math.min(core.length, s.core.length);
    const lcs = lcsLength(core, s.core);
    const { dice, shared } = diceBigram(core, s.core);
    const lcsOk = lcs >= 6 && lcs >= 0.45 * minLen;
    const diceOk = dice >= 0.5 && shared >= 3;
    if (!lcsOk && !diceOk) continue;
    const score = Math.max(dice, lcs / minLen);
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best ? { stock: best.stock, fuzzy: true } : null;
}

/** 글자 bigram Dice 유사도(0~1) + 공통 bigram 수. 중간 단어 치환/어순차에 강한 퍼지 신호. */
export function diceBigram(a: string, b: string): { dice: number; shared: number } {
  if (a.length < 2 || b.length < 2) return { dice: 0, shared: 0 };
  const setA = new Set<string>();
  for (let i = 0; i < a.length - 1; i++) setA.add(a.slice(i, i + 2));
  const setB = new Set<string>();
  for (let i = 0; i < b.length - 1; i++) setB.add(b.slice(i, i + 2));
  let shared = 0;
  for (const g of setA) if (setB.has(g)) shared++;
  return { dice: (2 * shared) / (setA.size + setB.size), shared };
}

/** 두 문자열의 공통 최장 연속부분문자열 길이 (퍼지 이름매칭용). */
export function lcsLength(a: string, b: string): number {
  const n = b.length;
  let max = 0;
  const dp = new Array(n + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let prev = 0;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev + 1 : 0;
      if (dp[j] > max) max = dp[j];
      prev = tmp;
    }
  }
  return max;
}

function normalizeShortageReason(value: unknown, confirmQty: number, orderQty: number): string {
  if (confirmQty >= orderQty) return '';
  const reason = typeof value === 'string' ? value.trim() : '';
  return SHORTAGE_REASONS.includes(reason) ? reason : DEFAULT_SHORTAGE_REASON;
}

/** 로켓 예약 멱등키 (발주번호·상품번호·바코드). */
function rocketConfirmSourceActionId(row: ConfirmComputedRow): string {
  return ['rocket-confirm', sourcePart(row.poNumber, 64), sourcePart(row.productNo, 64), sourcePart(row.barcode, 64)]
    .join(':')
    .slice(0, 200);
}

function sourcePart(value: unknown, maxLength: number): string {
  const text = String(value ?? '').trim().replace(/\s+/g, '');
  return (text || 'none').slice(0, maxLength);
}

function toSkipped(
  row: ConfirmComputedRow,
  reason: 'zero_confirm_qty' | 'unmatched_inventory',
): RocketConfirmCommitResult['skipped'][number] {
  return {
    poNumber: String(row.poNumber ?? ''),
    productNo: String(row.productNo ?? ''),
    barcode: String(row.barcode ?? ''),
    reason,
  };
}

function toFailed(
  row: ConfirmComputedRow,
  reason: string,
): RocketConfirmCommitResult['failed'][number] {
  return {
    poNumber: String(row.poNumber ?? ''),
    productNo: String(row.productNo ?? ''),
    barcode: String(row.barcode ?? ''),
    reason,
  };
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

/** 입고예정일 from/to → Prisma businessDate 필터(UTC 자정 기준, businessDate 는 @db.Date). */
function businessDateRange(from?: string, to?: string): { gte?: Date; lte?: Date } | null {
  const gte = from ? parseBusinessDate(from) : null;
  const lte = to ? parseBusinessDate(to) : null;
  if (!gte && !lte) return null;
  const range: { gte?: Date; lte?: Date } = {};
  if (gte) range.gte = gte;
  if (lte) range.lte = lte;
  return range;
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** 저장된 발주(items JSON) → 미리보기 계산용 ConfirmSourceRow[] 재구성(재수집 불필요). */
function reconstructConfirmRows(po: {
  poSeq: number;
  businessDate: Date;
  orderedAt: Date;
  status: string | null;
  vendorName: string | null;
  centerName: string | null;
  items: unknown;
}): ConfirmSourceRow[] {
  const items = Array.isArray(po.items) ? (po.items as RocketPoItem[]) : [];
  const eta = toDateKey(po.businessDate);
  const orderedAt = po.orderedAt.toISOString();
  const rows: ConfirmSourceRow[] = [];
  for (const item of items) {
    const barcode = String(item?.barcode ?? '').trim();
    const productName = typeof item?.name === 'string' ? item.name : '';
    if (!barcode && !productName) continue; // 바코드·이름 둘 다 없으면 매칭 불가 → 스킵
    rows.push({
      poNumber: String(po.poSeq),
      center: po.centerName ?? undefined,
      poStatus: po.status ?? undefined,
      vendorName: po.vendorName ?? undefined,
      productNo: typeof item?.productNo === 'string' ? item.productNo : undefined,
      barcode,
      productName,
      orderQty: toQuantity(item?.qty),
      purchasePrice: typeof item?.unitPrice === 'number' ? item.unitPrice : undefined,
      totalPurchase: typeof item?.amount === 'number' ? item.amount : undefined,
      expectedInboundDate: eta,
      poRegisteredAt: orderedAt,
    });
  }
  return rows;
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
