import { BadRequestException, Injectable } from '@nestjs/common';
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
}

export interface RocketConfirmFillResult {
  buffer: Buffer;
  fileName: string;
  totalRows: number;
  fullyConfirmed: number;
  shortRows: number;
  matchedSkus: number;
}

@Injectable()
export class RocketPoConfirmService {
  constructor(private readonly prisma: PrismaService) {}

  /** 가용재고(바코드→qty) 조회. 가용 = currentStock - reservedStock. */
  private async availabilityByBarcode(
    barcodes: string[],
    organizationId: string,
  ): Promise<Map<string, number>> {
    const options = await this.prisma.productOption.findMany({
      where: { organizationId, barcode: { in: barcodes }, isDeleted: false },
      select: { barcode: true, inventory: { select: { currentStock: true, reservedStock: true } } },
    });
    const map = new Map<string, number>();
    for (const option of options) {
      if (!option.barcode) continue;
      const inv = option.inventory;
      map.set(option.barcode, inv ? Math.max(0, inv.currentStock - inv.reservedStock) : 0);
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

    const aoa: (string | number)[][] = [HEADER];
    let fullyConfirmed = 0;
    let shortRows = 0;
    let matchedSkus = 0;

    for (const r of rows) {
      const barcode = String(r.barcode ?? '').trim();
      const orderQty = toInt(r.orderQty);
      const a = avail.get(barcode);
      if (a !== undefined) matchedSkus++;
      const confirmQty = Math.min(orderQty, a ?? 0);
      const reason = confirmQty < orderQty ? DEFAULT_SHORTAGE_REASON : '';
      if (reason) shortRows++;
      else fullyConfirmed++;
      aoa.push([
        r.poNumber ?? '', r.center ?? '', r.inboundType ?? '', r.poStatus ?? '',
        r.productNo ?? '', barcode, r.productName ?? '', orderQty, confirmQty,
        '', '', '', reason,
        r.returnManager ?? '', r.returnContact ?? '', r.returnAddress ?? '',
        r.purchasePrice ?? '', r.supplyPrice ?? '', r.vat ?? '', r.totalPurchase ?? '',
        r.expectedInboundDate ?? '', r.poRegisteredAt ?? '', r.xdock ?? 'N',
      ]);
    }

    return {
      ...this.workbookToResult(aoa),
      totalRows: rows.length,
      fullyConfirmed,
      shortRows,
      matchedSkus,
    };
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
    for (let i = 1; i < rows.length; i++) {
      const barcode = String(rows[i][COL.barcode] ?? '').trim();
      if (!barcode) continue;
      const orderQty = toInt(rows[i][COL.orderQty]);
      const a = avail.get(barcode);
      if (a !== undefined) matchedSkus++;
      const confirmQty = Math.min(orderQty, a ?? 0);
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

function toInt(value: unknown): number {
  return parseInt(String(value ?? '').replace(/[^0-9]/g, ''), 10) || 0;
}

function ymd(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}
