import * as XLSX from 'xlsx';
import { ROCKET_SHORTAGE_REASONS } from '@kiditem/shared/rocket-purchase-preview';
import type {
  RocketPoCatalogRow,
  RocketPurchaseConfirmationResponse,
} from '@kiditem/shared/rocket-purchase-preview';

const PRODUCT_SHEET = '상품목록';
const REASON_SHEET = 'hiddenSheet';
const HEADER = [
  '발주번호', '물류센터', '입고유형', '발주상태', '상품번호', '상품바코드', '상품이름',
  '발주수량', '확정수량', '유통(소비)기한', '제조일자', '생산년도', '납품부족사유',
  '회송담당자', '회송담당자 연락처', '회송지주소', '매입가', '공급가', '부가세',
  '총발주 매입금', '입고예정일', '발주등록일시', 'Xdock',
] as const;

export function buildRocketConfirmationWorkbook(input: {
  sourceRows: RocketPoCatalogRow[];
  confirmedRows: RocketPurchaseConfirmationResponse['rows'];
  now?: Date;
}): {
  blob: Blob;
  fileName: string;
  summary: {
    totalRows: number;
    confirmedQuantity: number;
    fullyConfirmedRows: number;
    shortRows: number;
  };
} {
  const confirmedByLineId = new Map(input.confirmedRows.map((row) => [row.poLineId, row]));
  if (confirmedByLineId.size !== input.sourceRows.length) {
    throw new Error('Rocket confirmation rows do not match the collected source evidence.');
  }
  let confirmedQuantity = 0;
  let fullyConfirmedRows = 0;
  let shortRows = 0;
  const rows: (string | number)[][] = [Array.from(HEADER)];
  for (const source of input.sourceRows) {
    const confirmation = source.confirmation;
    const confirmed = confirmedByLineId.get(source.poLineId);
    if (!confirmation) {
      throw new Error('Rocket confirmation metadata is missing. Reload the order collector extension.');
    }
    if (!confirmed) {
      throw new Error('Rocket confirmation result is missing a collected PO line.');
    }
    confirmedQuantity += confirmed.confirmedQuantity;
    if (confirmed.confirmedQuantity < source.orderQty) shortRows += 1;
    else fullyConfirmedRows += 1;
    rows.push([
      source.poNumber,
      confirmation.center,
      confirmation.inboundType,
      confirmation.poStatus,
      source.productNo,
      source.barcode,
      source.productName,
      source.orderQty,
      confirmed.confirmedQuantity,
      '',
      '',
      '',
      confirmed.shortageReason ?? '',
      confirmation.returnManager,
      confirmation.returnContact,
      confirmation.returnAddress,
      confirmation.purchasePrice,
      confirmation.supplyPrice,
      confirmation.vat,
      confirmation.totalPurchase,
      source.plannedDeliveryDate.replaceAll('-', ''),
      confirmation.poRegisteredAt,
      confirmation.xdock,
    ]);
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), PRODUCT_SHEET);
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(ROCKET_SHORTAGE_REASONS.map((reason) => [reason])),
    REASON_SHEET,
  );
  workbook.Workbook = {
    ...(workbook.Workbook ?? {}),
    Sheets: [
      { name: PRODUCT_SHEET, Hidden: 0 },
      { name: REASON_SHEET, Hidden: 1 },
    ],
  };
  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const now = input.now ?? new Date();
  return {
    blob: new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    fileName: `발주확정_${calendarStamp(now)}.xlsx`,
    summary: {
      totalRows: input.sourceRows.length,
      confirmedQuantity,
      fullyConfirmedRows,
      shortRows,
    },
  };
}

function calendarStamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}
