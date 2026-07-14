import { BadRequestException, Injectable } from '@nestjs/common';
import officeCrypto = require('officecrypto-tool');
import * as XLSX from 'xlsx';
import { TextDecoder } from 'util';
import { basename, extname } from 'path';

import type { MulterFile } from '../../common/types';
import { KIDSNOTE_SUMMARY_INFO, KIDSNOTE_DOC_SUMMARY_INFO } from './kidsnote-sellpia-meta';

const OUTPUT_HEADERS = [
  'No',
  '주문번호',
  '배송번호',
  '사이트',
  '배송순번',
  '브랜드명',
  '택배사',
  '송장번호',
  '주문완료일시',
  '주문내역상태',
  '배송종류',
  '배송처리유형',
  '주문판매유형',
  '합배송여부',
  '상품번호',
  '상품명',
  '단품명',
  '출고수량',
  '바코드',
  '증정품',
  '정상가',
  '판매가',
  '판매가(합계)',
  '공급가',
  '공급가(합계)',
  '배송비',
  'Y주문번호',
  '입점사',
  '회원ID',
  '주문자',
  '주문자휴대폰번호',
  '수취인',
  '수취인휴대폰번호',
  '우편번호',
  '배송지',
  '배송요청사항',
  '출고지시일시',
  '추가옵션명1',
  '추가옵션내용1',
  '추가옵션명2',
  '추가옵션내용2',
  '추가옵션명3',
  '추가옵션내용3',
  '추가옵션명4',
  '추가옵션내용4',
  '추가옵션명5',
  '추가옵션내용5',
] as const;

const OUTPUT_COLUMN_WIDTHS = [
  2, 15, 12, 18, 12, 12, 9, 12, 18, 18, 12, 18, 18, 15, 12, 80, 27, 12, 9,
  9, 9, 9, 17, 9, 17, 9, 13, 22, 12, 33, 24, 20, 24, 12, 99, 30, 18, 16,
  19, 16, 19, 16, 19, 16, 19, 16, 19,
] as const;

const REQUIRED_INPUT_HEADERS = [
  '주문번호',
  '배송번호',
  '주문완료일시',
  '주문내역상태',
  '배송종류',
  '배송처리유형',
  '주문판매유형',
  '합배송여부',
  '상품번호',
  '상품명',
  '단품명',
  '출고수량',
  '입점사',
  '회원ID',
  '주문자',
  '수취인',
  '수취인휴대폰번호',
  '우편번호',
  '배송지',
] as const;

const SHIPPING_FEE = 3000;
const OUTPUT_FILE_SUFFIX = '_아이스크림몰_변환';
const NUMERIC_OUTPUT_HEADERS = new Set<OutputHeader>([
  'No',
  '배송순번',
  '출고수량',
  '정상가',
  '판매가',
  '판매가(합계)',
  '공급가',
  '공급가(합계)',
  '배송비',
]);

type OutputHeader = (typeof OUTPUT_HEADERS)[number];
type SourceRow = Record<string, string>;
type OutputRow = Record<OutputHeader, string | number>;

export interface OrderCollectionConversion {
  buffer: Buffer;
  fileName: string;
  sourceRows: number;
  productRows: number;
  outputRows: number;
  skippedRows: number;
}

export interface OrderCollectionConversionOptions {
  password?: string;
}

export interface OrderCollectionRowsInput {
  headers: unknown;
  rows: unknown;
  fileName?: unknown;
}

/** 아이스크림몰 송장 업로드(출고완료 일괄등록) 파일 생성 입력. rows=아이스크림 배송조회, tracking=셀피아 송장. */
export interface IcecreamSendFinishInput {
  headers: unknown; // 아이스크림 배송조회 헤더
  rows: unknown; // 아이스크림 배송조회 행
  tracking: unknown; // 셀피아 송장 [{ ordNo, itemNo, invNo, courier }]
}

export interface IcecreamSendFinishResult {
  buffer: Buffer;
  fileName: string;
  sourceRows: number; // 아이스크림 배송조회 라인 수
  trackingRows: number; // 셀피아 송장 행 수
  matchedRows: number; // 송장이 매칭돼 파일에 들어간 라인 수
  unmappedCouriers: string[]; // hdcCd 코드로 못 바꾼 택배사명 (검토 필요)
}

/** 도매꾹 송장 엑셀일괄입력 파일 생성 입력. tracking=셀피아 송장 [{ ordNo, invNo, courier }]. */
export interface DomeggookShipInput {
  tracking: unknown;
}

export interface DomeggookShipResult {
  buffer: Buffer;
  fileName: string;
  orderNos: string[]; // 파일에 담긴 주문번호(shipXls tar 용)
  rowCount: number;
  unmappedCouriers: string[]; // 도매꾹 코드로 못 바꾼 택배사
}

export interface KidsnoteConvertItem {
  productName?: string;
  option?: string;
  qty?: number;
  amount?: number; // 상품총액
  shipFee?: number;
}
export interface KidsnoteConvertOrder {
  ono?: string;
  orderedAt?: string;
  paidAt?: string; // 입금일시
  buyer?: string; // 구매자명
  total?: number; // 총결제금액
  paid?: number; // 실결제금액
  payMethod?: string;
  status?: string;
  receiver?: string; // 수취인명
  mobile?: string;
  tel?: string;
  zip?: string;
  address?: string;
  request?: string; // 배송메세지
  items?: KidsnoteConvertItem[];
}
export interface KidsnoteConvertInput {
  orders?: KidsnoteConvertOrder[];
  fileName?: string;
}

export interface KkomangseConvertInput {
  xlsxBase64?: string; // 꼬망세(EduPre) "선택엑셀다운" .xlsx 의 base64
  fileName?: string;
  date?: string; // YYYY-MM-DD — 이 날짜(주문일시)의 주문만 변환 (없으면 전체)
}

export interface OnchannelConvertOrder {
  orderCode?: string;
  date?: string; // 주문일자 "2026-06-26 16:53:02" (리스트에서)
  productName?: string;
  productCode?: string;
  option?: string;
  qty?: number;
  productPrice?: number; // 상품금액 (모달, 택배비 제외)
  shippingFee?: number; // 배송비 (모달)
  deliveryType?: string; // 배송여부 (선불 등)
  customer?: string; // 고객명/받는사람
  phone?: string;
  emergency?: string; // 비상연락처
  zip?: string;
  address?: string;
  message?: string; // 남김말/배송메시지
  selfCode?: string; // 자체코드
}
export interface OnchannelConvertInput {
  orders?: OnchannelConvertOrder[];
  fileName?: string;
}

export interface KidkidsConvertItem {
  name?: string;
  qty?: number;
  unit?: number; // 공급단가 (주문서 logis_down5)
  sum?: number; // 합계
}
export interface KidkidsConvertOrder {
  om?: string; // 원본 주문번호 (참고/그룹키, 셀피아 출력엔 미사용)
  ordName?: string; // 주문자명(유치원) — 셀피아 "이름"
  orderDate?: string; // "2026-07-01 13:55:47" (주문일)
  recvName?: string; // 받는사람 이름 (참고)
  recvAddr?: string; // 우편번호 접두 포함 주소 ("10546 경기 …")
  recvTel?: string;
  recvMobile?: string;
  recvMsg?: string; // 배송요청사항
  items?: KidkidsConvertItem[];
}
export interface KidkidsConvertInput {
  orders?: KidkidsConvertOrder[];
  startOrderNo?: number; // 셀피아 주문번호 시작값 (임의 순번, 기본 96090)
  fileName?: string;
}

// 카카오(톡스토어) OMS `_search` 응답 한 건. 확장이 배송준비중(statusCode 301)만 스크랩해 넘긴다.
export interface KakaoConvertOrder {
  deliveryAcceptedAt?: string; // 배송지/수신자정보 입력일 (YYYYMMDDHHMMSS)
  statusCode?: number; // 301=배송준비중
  statusName?: string;
  paymentId?: number | string; // 주문번호
  itemId?: number | string; // 채널상품번호
  itemName?: string;
  optionTitle?: string;
  quantity?: number;
  shippingMethod?: string;
  deliveryServiceCompanyId?: number | string;
  invoiceNumber?: string;
  receiverName?: string;
  receiverMobileNumber?: string; // "010-5899-5334"
  receiverPhoneNumber?: string;
  address?: string;
  zoneCode?: string;
  postNo?: string;
  requestMessage?: string; // 배송메세지
  orderPaidAt?: string; // 주문일 (YYYYMMDDHHMMSS)
  standardPriceAmount?: number;
  optionPriceAmount?: number;
  sellerDiscountAmount?: number;
  sellerDiscountCouponAmount?: number;
  totalSellerPrice?: number;
  commissionAmount?: number;
  additionalCommissionAmount?: number;
  afCommissionAmount?: number;
  feeDiscountAmount?: number;
  channelName?: string;
  brandName?: string;
  sellerItemNo?: string;
  deliveryOriginId?: number | string;
  deliveryAmountType?: string;
  baseDeliveryAmount?: number;
  areaAdditionalAmount?: number;
  referrerType?: string; // 유입경로
  talkDealOrder?: string;
  itemType?: string;
  b2b?: boolean | string;
}
export interface KakaoConvertInput {
  orders?: KakaoConvertOrder[];
  fileName?: string;
}

@Injectable()
export class OrderCollectionService {
  async convertIcecreamMallOrderFile(
    file: MulterFile,
    options: OrderCollectionConversionOptions = {},
  ): Promise<OrderCollectionConversion> {
    const sourceRows = await readSourceRows(file, options);
    return convertIcecreamMallRows(sourceRows, buildOutputFileName(file.originalname));
  }

  convertIcecreamMallOrderRows(input: OrderCollectionRowsInput): OrderCollectionConversion {
    const headers = parseStringArray(input.headers, 'headers');
    const rows = parseRows(input.rows);
    if (headers.length === 0 || rows.length === 0) {
      throw new BadRequestException('변환할 주문 행이 없습니다.');
    }
    if (rows.length > 10_000) {
      throw new BadRequestException('한 번에 변환할 수 있는 행은 10,000개까지입니다.');
    }

    const sourceRows = rows.map((row) => mapSourceRow(headers, row));
    const inputFileName =
      typeof input.fileName === 'string' && input.fileName.trim()
        ? input.fileName.trim()
        : `아이스크림몰_${dayStamp(new Date())}_브라우저수집`;

    return convertIcecreamMallRows(sourceRows, buildOutputFileName(inputFileName));
  }

  /**
   * 아이스크림몰 "출고완료 일괄등록" 업로드 파일 생성 (비파괴 — 파일만 만든다. 몰 업로드는 프론트/확장이 별도로).
   * 아이스크림 배송조회(주문번호·배송번호·상품번호) + 셀피아 송장(주문번호→송장·택배사)을 주문번호로 조인해
   * 서버가 읽는 4컬럼 [배송번호(deliNo)·배송순번(deliSeq)·택배사코드(hdcCd)·송장번호(invNo)] xlsx 로 만든다.
   * ⚠️deliSeq 는 배송번호 그룹 안 순번(1,2,3…) — 아이스크림몰 실제 배송순번과 일치하는지 실데이터 검증 필요.
   */
  buildIcecreamSendFinishFile(input: IcecreamSendFinishInput): IcecreamSendFinishResult {
    const headers = parseStringArray(input.headers, 'headers');
    const rows = parseRows(input.rows);
    const tracking = parseSellpiaTracking(input.tracking);
    if (headers.length === 0 || rows.length === 0) {
      throw new BadRequestException('아이스크림몰 배송조회 데이터가 없습니다.');
    }
    const sourceRows = rows.map((row) => mapSourceRow(headers, row));

    // 송장 조회 인덱스: 주문번호+상품번호 우선, 없으면 주문번호만.
    const byOrderItem = new Map<string, { invNo: string; courier: string }>();
    const byOrder = new Map<string, { invNo: string; courier: string }>();
    for (const t of tracking) {
      const val = { invNo: t.invNo, courier: t.courier };
      if (t.ordNo && t.itemNo) byOrderItem.set(`${t.ordNo}${t.itemNo}`, val);
      if (t.ordNo && !byOrder.has(t.ordNo)) byOrder.set(t.ordNo, val);
    }

    const outputRows: (string | number)[][] = [];
    const unmapped = new Set<string>();
    const groups = groupByDelivery(sourceRows);
    for (const group of groups) {
      group.rows.forEach((source, index) => {
        const ordNo = cell(source, '주문번호');
        const deliNo = cell(source, '배송번호');
        const itemNo = cell(source, '상품번호');
        const deliSeq = index + 1;
        const hit = byOrderItem.get(`${ordNo}${itemNo}`) ?? byOrder.get(ordNo);
        if (!hit || !hit.invNo) return; // 아직 송장 없는(미발송) 라인은 제외
        const hdcCd = courierToHdcCd(hit.courier);
        if (!hdcCd) unmapped.add(hit.courier || '(빈 택배사)');
        outputRows.push([deliNo, deliSeq, hdcCd, hit.invNo]);
      });
    }

    // 서버 excelColumns="deliNo, deliSeq, hdcCd, invNo" 순서. 1행은 헤더(파서가 건너뜀).
    const sheet = XLSX.utils.aoa_to_sheet([
      ['배송번호', '배송순번', '택배사코드', '송장번호'],
      ...outputRows,
    ]);
    sheet['!cols'] = [{ wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 18 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer;

    return {
      buffer,
      fileName: `아이스크림몰_송장업로드_${dayStamp(new Date())}.xlsx`,
      sourceRows: sourceRows.length,
      trackingRows: tracking.length,
      matchedRows: outputRows.length,
      unmappedCouriers: [...unmapped],
    };
  }

  /**
   * 도매꾹 "송장 엑셀일괄입력"(POST /sc/order/shipXls, deliXls 파일) 업로드용 .xls 생성 (비파괴 — 파일만).
   * 셀피아 송장(주문번호=도매꾹 주문번호 직접 조인)으로 양식 3컬럼 [주문번호·택배사코드명·송장번호].
   * 택배사코드명 = 도매꾹 택배사코드(CJ대한통운=DAEHAN). 주문당 1건(중복 주문번호 제거).
   */
  buildDomeggookShipFile(input: DomeggookShipInput): DomeggookShipResult {
    const tracking = parseSellpiaTracking(input.tracking);
    if (tracking.length === 0) {
      throw new BadRequestException('도매꾹 송장이 없습니다.');
    }
    const seen = new Set<string>();
    const dataRows: string[][] = [];
    const orderNos: string[] = [];
    const unmapped = new Set<string>();
    for (const t of tracking) {
      if (seen.has(t.ordNo)) continue;
      seen.add(t.ordNo);
      const code = SELLPIA_DELICOM_TO_DOMEGGOOK[t.courier] ?? '';
      if (!code) unmapped.add(t.courier || '(빈 택배사)');
      dataRows.push([t.ordNo, code, t.invNo]);
      orderNos.push(t.ordNo);
    }
    const sheet = XLSX.utils.aoa_to_sheet([['주문번호', '택배사코드명', '송장번호'], ...dataRows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
    const buffer = XLSX.write(workbook, { bookType: 'xls', type: 'buffer' }) as Buffer;
    return {
      buffer,
      fileName: `도매꾹_송장_${dayStamp(new Date())}.xls`,
      orderNos,
      rowCount: orderNos.length,
      unmappedCouriers: [...unmapped],
    };
  }

  convertKidsnoteOrders(input: KidsnoteConvertInput): OrderCollectionConversion {
    const orders = Array.isArray(input?.orders) ? input.orders : [];
    if (orders.length === 0) {
      throw new BadRequestException('변환할 키즈노트 주문이 없습니다.');
    }
    if (orders.length > 5_000) {
      throw new BadRequestException('한 번에 변환할 수 있는 주문은 5,000건까지입니다.');
    }
    const base =
      typeof input.fileName === 'string' && input.fileName.trim()
        ? input.fileName.trim()
        : `키즈노트_${dayStamp(new Date())}`;
    const name = base.toLowerCase().endsWith('.xls') ? base : `${base}.xls`;
    return convertKidsnoteRows(orders, name);
  }

  convertKkomangseOrders(input: KkomangseConvertInput): OrderCollectionConversion {
    const b64 = typeof input?.xlsxBase64 === 'string' ? input.xlsxBase64.trim() : '';
    if (!b64) {
      throw new BadRequestException('변환할 꼬망세 엑셀 데이터가 없습니다.');
    }
    let sourceAoa: (string | number)[][];
    try {
      const wb = XLSX.read(Buffer.from(b64, 'base64'), { type: 'buffer' });
      const sheet = wb.Sheets[wb.SheetNames[0] ?? ''];
      sourceAoa = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
        header: 1,
        defval: '',
        raw: false,
      });
    } catch {
      throw new BadRequestException('꼬망세 엑셀을 읽을 수 없습니다.');
    }
    const base =
      typeof input.fileName === 'string' && input.fileName.trim()
        ? input.fileName.trim()
        : `꼬망세_${dayStamp(new Date())}`;
    const name = base.toLowerCase().endsWith('.xls') ? base : `${base}.xls`;
    const dateFilter = typeof input.date === 'string' ? input.date.trim() : '';
    return convertKkomangseRows(sourceAoa, name, dateFilter);
  }

  convertOnchannelOrders(input: OnchannelConvertInput): OrderCollectionConversion {
    const orders = Array.isArray(input?.orders) ? input.orders : [];
    if (orders.length === 0) {
      throw new BadRequestException('변환할 온채널 주문이 없습니다.');
    }
    if (orders.length > 5_000) {
      throw new BadRequestException('한 번에 변환할 수 있는 주문은 5,000건까지입니다.');
    }
    const base =
      typeof input.fileName === 'string' && input.fileName.trim()
        ? input.fileName.trim()
        : `온채널_${dayStamp(new Date())}`;
    const name = base.toLowerCase().endsWith('.xls') ? base : `${base}.xls`;
    return convertOnchannelRows(orders, name);
  }

  convertKidkidsOrders(input: KidkidsConvertInput): OrderCollectionConversion {
    const orders = Array.isArray(input?.orders) ? input.orders : [];
    if (orders.length === 0) {
      throw new BadRequestException('변환할 키드키즈 주문이 없습니다.');
    }
    if (orders.length > 5_000) {
      throw new BadRequestException('한 번에 변환할 수 있는 주문은 5,000건까지입니다.');
    }
    const base =
      typeof input.fileName === 'string' && input.fileName.trim()
        ? input.fileName.trim()
        : `키드키즈_${dayStamp(new Date())}`;
    const name = base.toLowerCase().endsWith('.xls') ? base : `${base}.xls`;
    const startNo =
      Number.isFinite(input.startOrderNo) && Number(input.startOrderNo) > 0
        ? Math.floor(Number(input.startOrderNo))
        : 96090;
    return convertKidkidsRows(orders, name, startNo);
  }

  convertKakaoOrders(input: KakaoConvertInput): OrderCollectionConversion {
    const orders = Array.isArray(input?.orders) ? input.orders : [];
    if (orders.length === 0) {
      throw new BadRequestException('변환할 카카오 주문이 없습니다.');
    }
    if (orders.length > 5_000) {
      throw new BadRequestException('한 번에 변환할 수 있는 주문은 5,000건까지입니다.');
    }
    const base =
      typeof input.fileName === 'string' && input.fileName.trim()
        ? input.fileName.trim()
        : `카카오_${dayStamp(new Date())}`;
    const name = base.toLowerCase().endsWith('.xls') ? base : `${base}.xls`;
    return convertKakaoRows(orders, name);
  }

  /**
   * 도매꾹 주문 CSV(엑셀다운로드) → 셀피아 .xls. 도매꾹 셀피아 양식은 CSV 43컬럼을 그대로 쓴다
   * (재배치 없음). CSV 는 EUC-KR(CP949)이라 UTF-8 로 디코딩해야 안 깨진다. date 주면 그날 주문만.
   */
  convertDomeggookOrderFile(file: MulterFile, options?: { date?: string }): OrderCollectionConversion {
    if (!file?.buffer) {
      throw new BadRequestException('도매꾹 CSV 파일이 필요합니다.');
    }
    const text = new TextDecoder('euc-kr').decode(file.buffer);
    const wb = XLSX.read(text, { type: 'string', raw: true });
    const sheet = wb.Sheets[wb.SheetNames[0] ?? ''];
    if (!sheet) {
      throw new BadRequestException('도매꾹 CSV 를 읽지 못했습니다.');
    }
    const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
      header: 1,
      raw: false,
      defval: '',
    });
    if (aoa.length <= 1) {
      throw new BadRequestException('도매꾹 CSV 에 주문이 없습니다.');
    }
    const headers = (aoa[0] as unknown[]).map((h) => String(h ?? '').trim());
    const dateIdx = headers.indexOf('주문일시');
    const date = typeof options?.date === 'string' ? options.date.trim() : '';
    const dateSlash = date ? date.replace(/-/g, '/') : ''; // CSV 주문일시 = "2026/07/01 ..." 형식
    const dataRows = aoa.slice(1).filter((row) => {
      const cells = row as (string | number)[];
      if (cells.every((c) => String(c ?? '').trim() === '')) return false; // 빈 행 제외
      // 오늘(주문일시) 필터: dateSlash 로 시작하는 행만 (없으면 전체)
      if (dateSlash && dateIdx >= 0 && !String(cells[dateIdx] ?? '').startsWith(dateSlash)) return false;
      return true;
    });
    if (dataRows.length === 0) {
      throw new BadRequestException(
        date ? `${date} 도매꾹 신규 주문이 없습니다.` : '변환할 도매꾹 주문이 없습니다.',
      );
    }
    const outSheet = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
    outSheet['!cols'] = headers.map((h) => ({ wch: Math.min(42, Math.max(10, h.length + 6)) }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, outSheet, 'domeggook');
    const rawBuffer = XLSX.write(workbook, { bookType: 'xls', bookSST: true, type: 'buffer' }) as Buffer;
    const buffer = wrapKidsnoteSellpiaXls(rawBuffer); // 셀피아 호환 메타 재조립
    return {
      buffer,
      fileName: `도매꾹_${date || dayStamp(new Date())}_변환.xls`,
      sourceRows: aoa.length - 1,
      productRows: 0,
      outputRows: dataRows.length,
      skippedRows: aoa.length - 1 - dataRows.length,
    };
  }

  /**
   * 롯데ON 배송관리 엑셀(다운로드) → 셀피아 .xls. 롯데ON 셀피아 양식은 다운로드 57컬럼을 그대로 쓴다
   * (재배치 없음). ⚠️ 롯데ON 다운로드는 .xlsx(OpenXML)인데 셀피아는 .xls(BIFF8)만 읽으므로 변환 필수.
   */
  /**
   * 보리보리(seller-club) 출고대기 언마스킹 엑셀(.xlsx) → 셀피아 .xls. 셀피아 보리보리 양식(35컬럼)이
   * 출고대기 다운로드와 동일해 재배치 없이 그대로 쓴다 (포맷만 xlsx→xls + 셀피아 호환 메타).
   */
  convertBoriboriOrderFile(file: MulterFile): OrderCollectionConversion {
    if (!file?.buffer) {
      throw new BadRequestException('보리보리 엑셀 파일이 필요합니다.');
    }
    const wb = XLSX.read(file.buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0] ?? ''];
    if (!sheet) {
      throw new BadRequestException('보리보리 엑셀을 읽지 못했습니다.');
    }
    const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
      header: 1,
      raw: false,
      defval: '',
    });
    const headers = (aoa[0] as unknown[]).map((h) => String(h ?? '').trim());
    const dataRows = aoa
      .slice(1)
      .filter((row) => (row as (string | number)[]).some((c) => String(c ?? '').trim() !== ''));
    if (dataRows.length === 0) {
      throw new BadRequestException('보리보리 신규 주문이 없습니다.');
    }
    const outSheet = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
    outSheet['!cols'] = headers.map((h) => ({ wch: Math.min(42, Math.max(10, h.length + 6)) }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, outSheet, 'Sheet0'); // 원본 시트명 유지
    const rawBuffer = XLSX.write(workbook, { bookType: 'xls', bookSST: true, type: 'buffer' }) as Buffer;
    const buffer = wrapKidsnoteSellpiaXls(rawBuffer); // 셀피아 호환 메타 재조립
    return {
      buffer,
      fileName: `보리보리_${dayStamp(new Date())}_변환.xls`,
      sourceRows: aoa.length - 1,
      productRows: 0,
      outputRows: dataRows.length,
      skippedRows: aoa.length - 1 - dataRows.length,
    };
  }

  // 티쳐몰(FirstMall selleradmin) = passthrough. 다운로드 엑셀이 이미 셀피아 양식(36컬럼) 그대로라
  // 컬럼 재배치 없이 포맷만 변환. 원본은 Excel-2003-XML(SpreadsheetML, UTF-8) → SheetJS 가 자동 인식.
  // 셀피아가 SheetJS .xls 를 못 읽으므로 wrapKidsnoteSellpiaXls 로 WISA 메타(SummaryInformation) 재조립.
  convertTeachervilleOrderFile(file: MulterFile): OrderCollectionConversion {
    if (!file?.buffer) {
      throw new BadRequestException('티쳐몰 엑셀 파일이 필요합니다.');
    }
    const wb = XLSX.read(file.buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0] ?? ''];
    if (!sheet) {
      throw new BadRequestException('티쳐몰 엑셀을 읽지 못했습니다.');
    }
    const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
      header: 1,
      raw: false,
      defval: '',
    });
    const headers = (aoa[0] as unknown[]).map((h) => String(h ?? '').trim());
    const dataRows = aoa
      .slice(1)
      .filter((row) => (row as (string | number)[]).some((c) => String(c ?? '').trim() !== ''));
    if (dataRows.length === 0) {
      throw new BadRequestException('티쳐몰 신규 주문이 없습니다.');
    }
    const outSheet = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
    outSheet['!cols'] = headers.map((h) => ({ wch: Math.min(42, Math.max(10, h.length + 6)) }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, outSheet, 'Sheet0');
    const rawBuffer = XLSX.write(workbook, { bookType: 'xls', bookSST: true, type: 'buffer' }) as Buffer;
    const buffer = wrapKidsnoteSellpiaXls(rawBuffer); // 셀피아 호환 메타 재조립
    return {
      buffer,
      fileName: `티쳐몰_${dayStamp(new Date())}_변환.xls`,
      sourceRows: aoa.length - 1,
      productRows: 0,
      outputRows: dataRows.length,
      skippedRows: aoa.length - 1 - dataRows.length,
    };
  }

  convertLotteonOrderFile(file: MulterFile): OrderCollectionConversion {
    if (!file?.buffer) {
      throw new BadRequestException('롯데ON 엑셀 파일이 필요합니다.');
    }
    const wb = XLSX.read(file.buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0] ?? ''];
    if (!sheet) {
      throw new BadRequestException('롯데ON 엑셀을 읽지 못했습니다.');
    }
    const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
      header: 1,
      raw: false,
      defval: '',
    });
    if (aoa.length <= 1) {
      throw new BadRequestException('롯데ON 신규 주문이 없습니다.');
    }
    const headers = (aoa[0] as unknown[]).map((h) => String(h ?? '').trim());
    const dataRows = aoa
      .slice(1)
      .filter((row) => (row as (string | number)[]).some((c) => String(c ?? '').trim() !== ''));
    if (dataRows.length === 0) {
      throw new BadRequestException('롯데ON 신규 주문이 없습니다.');
    }
    const outSheet = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
    outSheet['!cols'] = headers.map((h) => ({ wch: Math.min(42, Math.max(10, h.length + 6)) }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, outSheet, 'sheet1'); // 원본 시트명 유지
    const rawBuffer = XLSX.write(workbook, { bookType: 'xls', bookSST: true, type: 'buffer' }) as Buffer;
    const buffer = wrapKidsnoteSellpiaXls(rawBuffer); // 셀피아 호환 메타 재조립 (SummaryInformation)
    return {
      buffer,
      fileName: `롯데ON_${dayStamp(new Date())}_변환.xls`,
      sourceRows: aoa.length - 1,
      productRows: 0,
      outputRows: dataRows.length,
      skippedRows: aoa.length - 1 - dataRows.length,
    };
  }

  /**
   * GS샵 협력사 배송관리 다운로드(클라이언트가 조립한 직송주문 엑셀) → 셀피아 .xls. 79컬럼 그대로 쓴다
   * (재배치 없음). ⚠️ GS 다운로드는 .xlsx 인데 셀피아는 .xls(BIFF8)만 읽으므로 변환 필수.
   * col37 헤더는 GS 현행 "속성상품코드"인데 셀피아 참조양식은 "상품상세코드"라 참조와 동일하게 맞춘다.
   */
  convertGsshopOrderFile(file: MulterFile): OrderCollectionConversion {
    if (!file?.buffer) {
      throw new BadRequestException('GS샵 엑셀 파일이 필요합니다.');
    }
    const wb = XLSX.read(file.buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0] ?? ''];
    if (!sheet) {
      throw new BadRequestException('GS샵 엑셀을 읽지 못했습니다.');
    }
    const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
      header: 1,
      raw: false,
      defval: '',
    });
    if (aoa.length <= 1) {
      throw new BadRequestException('GS샵 신규 주문이 없습니다.');
    }
    const headers = (aoa[0] as unknown[]).map((h) => String(h ?? '').trim());
    // 셀피아 참조양식과 헤더명 일치: GS 현행 "속성상품코드" → 참조 "상품상세코드" (같은 위치, 라벨만 통일).
    const attrIdx = headers.indexOf('속성상품코드');
    if (attrIdx >= 0) headers[attrIdx] = '상품상세코드';
    const dataRows = aoa
      .slice(1)
      .filter((row) => (row as (string | number)[]).some((c) => String(c ?? '').trim() !== ''));
    if (dataRows.length === 0) {
      throw new BadRequestException('GS샵 신규 주문이 없습니다.');
    }
    const outSheet = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
    outSheet['!cols'] = headers.map((h) => ({ wch: Math.min(42, Math.max(10, h.length + 6)) }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, outSheet, '직송주문'); // 참조 시트명(직송주문_기간) 계열
    const rawBuffer = XLSX.write(workbook, { bookType: 'xls', bookSST: true, type: 'buffer' }) as Buffer;
    const buffer = wrapKidsnoteSellpiaXls(rawBuffer); // 셀피아 호환 메타 재조립
    return {
      buffer,
      fileName: `GS샵_${dayStamp(new Date())}_변환.xls`,
      sourceRows: aoa.length - 1,
      productRows: 0,
      outputRows: dataRows.length,
      skippedRows: aoa.length - 1 - dataRows.length,
    };
  }

  // 올웨이즈: "엑셀추출하기"로 앱이 조립한 xlsx(26컬럼, 시트 "주문 내역")를 그대로 .xls + 셀피아 메타로 변환.
  convertAlwayzOrderFile(file: MulterFile): OrderCollectionConversion {
    if (!file?.buffer) {
      throw new BadRequestException('올웨이즈 엑셀 파일이 필요합니다.');
    }
    const wb = XLSX.read(file.buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0] ?? ''];
    if (!sheet) {
      throw new BadRequestException('올웨이즈 엑셀을 읽지 못했습니다.');
    }
    const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
      header: 1,
      raw: false,
      defval: '',
    });
    const headers = ((aoa[0] as unknown[]) ?? []).map((h) => String(h ?? '').trim());
    const dataRows = aoa
      .slice(1)
      .filter((row) => (row as (string | number)[]).some((c) => String(c ?? '').trim() !== ''));
    if (dataRows.length === 0) {
      throw new BadRequestException('올웨이즈 신규 주문이 없습니다.');
    }
    const outSheet = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
    outSheet['!cols'] = headers.map((h) => ({ wch: Math.min(42, Math.max(10, h.length + 6)) }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, outSheet, '주문 내역'); // 올웨이즈 참조 시트명
    const rawBuffer = XLSX.write(workbook, { bookType: 'xls', bookSST: true, type: 'buffer' }) as Buffer;
    const buffer = wrapKidsnoteSellpiaXls(rawBuffer); // 셀피아 호환 메타 재조립
    return {
      buffer,
      fileName: `올웨이즈_${dayStamp(new Date())}_변환.xls`,
      sourceRows: aoa.length - 1,
      productRows: 0,
      outputRows: dataRows.length,
      skippedRows: aoa.length - 1 - dataRows.length,
    };
  }
}

function convertIcecreamMallRows(
  sourceRows: SourceRow[],
  fileName: string,
): OrderCollectionConversion {
  if (sourceRows.length === 0) {
    throw new BadRequestException('변환할 주문 행이 없습니다.');
  }

  const headers = Object.keys(sourceRows[0] ?? {});
  if (isConvertedOutput(headers)) {
    return normalizeConvertedOutputRows(sourceRows, fileName);
  }

  validateInputHeaders(headers);

  const includedRows = sourceRows.filter((row) => cell(row, '상품명') !== '');
  if (includedRows.length === 0) {
    throw new BadRequestException('변환할 상품 주문 행이 없습니다.');
  }

  const outputRows = buildOutputRows(includedRows);
  return buildConversionResult({
    outputRows,
    helperRows: includedRows,
    fileName,
    sourceRows: sourceRows.length,
    productRows: includedRows.length,
    skippedRows: sourceRows.length - includedRows.length,
  });
}

function kidsnoteNum(value: unknown): number {
  const n = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

// "2026-06-30 09:37:56" → "2026-06-30 09:37:56 AM" (셀피아 양식: 12시간 + AM/PM).
function kidsnoteDate(value: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(value);
  if (!m) return value;
  let h = parseInt(m[2], 10);
  const ap = h < 12 ? 'AM' : 'PM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${m[1]} ${String(h).padStart(2, '0')}:${m[3]}:${m[4] ?? '00'} ${ap}`;
}

// 셀피아 키즈노트 업로드 양식 (시트 "주문목록", 21컬럼) — WISA 키즈노트.xls 양식.
const KIDSNOTE_SELLPIA_HEADERS = [
  '주문번호', '주문일시', '입금일시', '주문상품', '상품옵션', '주문수량', '구매자명', '입금자명',
  '총결제금액', '실결제금액', '상품총액', '배송비', '결제방법', '수취인명', '수취인 전화번호',
  '수취인 휴대폰번호', '수취인 우편번호', '수취인 주소', '배송메세지', '주문상태', '순서',
] as const;

// SheetJS .xls 는 SummaryInformation 메타가 없고 Sh33tJ5 서명 스트림만 붙어 셀피아 파서가 거부한다.
// → Workbook 스트림만 꺼내, WISA 스타일 메타(SummaryInformation/DocumentSummaryInformation, 썸네일 제거)와
//   함께 CFB 를 재조립한다. 이래야 셀피아가 정상 인식한다. (실측으로 확인)
function wrapKidsnoteSellpiaXls(buf: Buffer): Buffer {
  const CFB = (
    XLSX as unknown as {
      CFB: {
        read(d: Buffer, o: { type: 'buffer' }): { FullPaths: string[]; FileIndex: Array<{ content: Uint8Array }> };
        write(cfb: unknown, o: { type: 'buffer' }): Uint8Array;
        utils: { cfb_new(): unknown; cfb_add(cfb: unknown, path: string, data: Uint8Array): void };
      };
    }
  ).CFB;
  const src = CFB.read(buf, { type: 'buffer' });
  const idx = src.FullPaths.findIndex((p) => /Workbook$/i.test(p));
  if (idx < 0) return buf;
  const out = CFB.utils.cfb_new();
  CFB.utils.cfb_add(out, '/Workbook', src.FileIndex[idx].content);
  CFB.utils.cfb_add(out, '/SummaryInformation', KIDSNOTE_SUMMARY_INFO);
  CFB.utils.cfb_add(out, '/DocumentSummaryInformation', KIDSNOTE_DOC_SUMMARY_INFO);
  return Buffer.from(CFB.write(out, { type: 'buffer' }));
}

/** 스크랩한 키즈노트 주문(+상세) → 셀피아 "주문목록" 업로드 양식(21컬럼). 품목 단위 1행 + 택배비 행. */
function convertKidsnoteRows(
  orders: KidsnoteConvertOrder[],
  fileName: string,
): OrderCollectionConversion {
  const aoa: (string | number)[][] = [KIDSNOTE_SELLPIA_HEADERS.slice() as string[]];
  let seq = 0;
  for (const order of orders) {
    const ono = String(order?.ono ?? '').trim();
    const orderedAt = kidsnoteDate(String(order?.orderedAt ?? ''));
    const paidAt = kidsnoteDate(String(order?.paidAt ?? '') || String(order?.orderedAt ?? ''));
    const buyer = String(order?.buyer ?? '');
    const receiver = (String(order?.receiver ?? '') || buyer) + '(키즈노트)';
    const mobile = String(order?.mobile ?? '');
    const tel = String(order?.tel ?? '') || mobile; // 셀피아 양식: 전화번호=휴대폰 동일
    const zip = String(order?.zip ?? '');
    const address = String(order?.address ?? '');
    const request = String(order?.request ?? '');
    const status = '결제완료'; // 셀피아 주문접수는 결제완료로 고정
    const payMethod = String(order?.payMethod ?? '');
    const items =
      Array.isArray(order?.items) && order.items.length
        ? order.items
        : [{ productName: '', qty: 0 } as KidsnoteConvertItem];
    const orderShip = items.reduce((m, it) => Math.max(m, kidsnoteNum(it?.shipFee)), 0);
    items.forEach((item, i) => {
      seq += 1;
      const amount = kidsnoteNum(item?.amount);
      const realPaid = Math.round(amount * 0.85); // 실결제 = 금액 × 0.85(정산율)
      aoa.push([
        ono, orderedAt, paidAt,
        String(item?.productName ?? ''),
        String(item?.option ?? ''),
        kidsnoteNum(item?.qty),
        buyer, '',
        amount, realPaid,
        amount,
        i === 0 ? orderShip : 0,
        payMethod,
        receiver, tel, mobile, zip, address,
        request, status, seq,
      ]);
    });
    // 셀피아 양식: 주문당 "택배비" 행 별도 (실결제금액=배송비).
    if (orderShip > 0) {
      seq += 1;
      aoa.push([
        ono, orderedAt, paidAt,
        '택배비', '', 1,
        '', '', '', orderShip, '', '', '',
        receiver, tel, mobile, zip, address,
        '', '', seq,
      ]);
    }
  }
  if (aoa.length <= 1) {
    throw new BadRequestException('변환할 키즈노트 주문 품목이 없습니다.');
  }
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  // 컬럼 너비 — 주문상품(3)·수취인 주소(17)만 넓게. 숫자 셀 천단위 서식(#,##0).
  sheet['!cols'] = KIDSNOTE_SELLPIA_HEADERS.map((_, i) => ({ wch: i === 3 || i === 17 ? 43.25 : 16.5 }));
  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1');
  for (let r = range.s.r + 1; r <= range.e.r; r += 1) {
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const cellEntry = sheet[XLSX.utils.encode_cell({ r, c })];
      if (cellEntry && cellEntry.t === 'n') cellEntry.z = '#,##0';
    }
  }
  // 단순 workbook — Props/Workbook 글로벌을 세팅하지 않는다 (그게 OLE2 헤더를 깨뜨려 셀피아가 못 읽었음).
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, '주문목록');
  const rawBuffer = XLSX.write(workbook, { bookType: 'xls', bookSST: true, type: 'buffer' }) as Buffer;
  // 셀피아 호환: SheetJS Workbook 만 꺼내 WISA 메타 스트림과 CFB 재조립.
  const buffer = wrapKidsnoteSellpiaXls(rawBuffer);
  return {
    buffer,
    fileName,
    sourceRows: orders.length,
    // 앱 규칙: 주문 수 = outputRows - productRows. 전체행 − 주문수 = 상품행이 되도록 둔다.
    productRows: Math.max(0, aoa.length - 1 - orders.length),
    outputRows: aoa.length - 1,
    skippedRows: 0,
  };
}

// 셀피아 꼬망세 업로드 양식 (27컬럼) — EduPre "선택엑셀다운"(28컬럼)에서 정산상태·송장등록일시 제거 + 순서 추가.
const KKOMANGSE_HEADERS = [
  '고유번호', '주문번호', '주문일시', '주문자 이름', '주문자 휴대폰', '받는분 이름', '받는분 휴대폰',
  '받는분 우편번호', '받는분 주소', '받는분 지번주소', '상품코드', '대표상품명', '옵션1', '옵션2', '옵션3',
  '판매단가', '수량', '금액', '배송비', '수수료율', '정산예정금액', '배송상태', '택배사', '송장번호',
  '배송시 유의사항', '관리자메모', '순서',
] as const;

// 데이터 시트명 = "상품별 배송처리 - YYYY-MM-DD-HHMMSS" (원본 export 와 동일 형식).
function kkomangseSheetName(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `상품별 배송처리 - ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** 꼬망세(EduPre) 선택엑셀다운 → 셀피아 업로드 양식. 받는분+(꼬망세), 배송상태=배송대기, 순서 추가. */
function convertKkomangseRows(
  sourceAoa: (string | number)[][],
  fileName: string,
  dateFilter: string,
): OrderCollectionConversion {
  const header = (sourceAoa[0] ?? []).map((c) => String(c ?? '').trim());
  const idx = (name: string) => header.indexOf(name);
  const dateIdx = idx('주문일시');
  const aoa: (string | number)[][] = [KKOMANGSE_HEADERS.slice() as string[]];
  let seq = 0;
  for (const row of sourceAoa.slice(1)) {
    if (!Array.isArray(row) || row.every((c) => String(c ?? '').trim() === '')) continue;
    // 날짜 필터: 주문일시가 dateFilter(YYYY-MM-DD)로 시작하는 행만 (dateFilter 없으면 전체)
    if (dateFilter && dateIdx >= 0 && !String(row[dateIdx] ?? '').startsWith(dateFilter)) continue;
    seq += 1;
    const get = (name: string): string | number => {
      const i = idx(name);
      return i >= 0 && row[i] != null ? row[i] : '';
    };
    aoa.push([
      get('고유번호'), get('주문번호'), get('주문일시'), get('주문자 이름'), get('주문자 휴대폰'),
      `${String(get('받는분 이름'))}(꼬망세)`, // 받는분 + 몰 태그
      get('받는분 휴대폰'), get('받는분 우편번호'), get('받는분 주소'), get('받는분 지번주소'),
      get('상품코드'), get('대표상품명'), get('옵션1'), get('옵션2'), get('옵션3'),
      get('판매단가'), get('수량'), get('금액'), get('배송비'), get('수수료율'), get('정산예정금액'),
      '배송대기', // 배송상태 고정 (셀피아 신규 접수)
      get('택배사'), get('송장번호'), get('배송시 유의사항'), get('관리자메모'),
      seq, // 순서
    ]);
  }
  if (aoa.length <= 1) {
    throw new BadRequestException(
      dateFilter ? `${dateFilter} 꼬망세 신규 주문이 없습니다.` : '변환할 꼬망세 주문이 없습니다.',
    );
  }
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, kkomangseSheetName());
  const rawBuffer = XLSX.write(workbook, { bookType: 'xls', bookSST: true, type: 'buffer' }) as Buffer;
  const buffer = wrapKidsnoteSellpiaXls(rawBuffer); // 셀피아 호환 메타 재조립 (KidsNote와 동일)
  return {
    buffer,
    fileName,
    sourceRows: aoa.length - 1,
    productRows: 0,
    outputRows: aoa.length - 1,
    skippedRows: 0,
  };
}

// 셀피아 온채널 업로드 양식 (시트 "Simple", 16컬럼) — 상세모달 스크랩 데이터 → 상품행 + 택배비행.
const ONCHANNEL_HEADERS = [
  '주문코드', '일자', '상품명', '상품코드', '옵션', '수량', '가격', '배송여부', '고객명', '연락처',
  '비상연락처', '우편번호', '배송지주소', '남김말', '자체코드', '순서',
] as const;

/** 온채널 주문(리스트+상세모달) → 셀피아 "Simple" 양식. 가격=상품금액 / 별도 택배비행=배송비, 고객명+(온채널), 순서. */
function convertOnchannelRows(
  orders: OnchannelConvertOrder[],
  fileName: string,
): OrderCollectionConversion {
  const aoa: (string | number)[][] = [ONCHANNEL_HEADERS.slice() as string[]];
  let seq = 0;
  for (const o of orders) {
    const orderCode = String(o?.orderCode ?? '');
    const date = String(o?.date ?? '');
    const customer = `${String(o?.customer ?? '')}(온채널)`; // 고객명 + 몰 태그
    const phone = String(o?.phone ?? '');
    const emergency = String(o?.emergency ?? '') || phone;
    const zip = o?.zip ?? '';
    const address = String(o?.address ?? '');
    const message = String(o?.message ?? '');
    const shippingFee = kidsnoteNum(o?.shippingFee);
    seq += 1;
    aoa.push([
      orderCode, date,
      String(o?.productName ?? ''), String(o?.productCode ?? ''), String(o?.option ?? ''),
      kidsnoteNum(o?.qty) || 1,
      kidsnoteNum(o?.productPrice), // 가격 = 상품금액 (배송비 제외)
      String(o?.deliveryType ?? '') || '선불',
      customer, phone, emergency, zip, address, message, String(o?.selfCode ?? ''), seq,
    ]);
    // 택배비 행 (배송비 별도)
    if (shippingFee > 0) {
      seq += 1;
      aoa.push([
        orderCode, date, '택배비', '', '', 1, shippingFee, '',
        customer, phone, emergency, zip, address, message, '', seq,
      ]);
    }
  }
  if (aoa.length <= 1) {
    throw new BadRequestException('변환할 온채널 주문이 없습니다.');
  }
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  // 내용 다 보이게 열 너비 넉넉히 (한글은 글자당 폭이 넓어 여유 둠).
  sheet['!cols'] = [
    { wch: 18 }, // 주문코드
    { wch: 22 }, // 일자
    { wch: 48 }, // 상품명
    { wch: 16 }, // 상품코드
    { wch: 28 }, // 옵션
    { wch: 9 }, // 수량
    { wch: 13 }, // 가격
    { wch: 11 }, // 배송여부
    { wch: 20 }, // 고객명
    { wch: 18 }, // 연락처
    { wch: 18 }, // 비상연락처
    { wch: 12 }, // 우편번호
    { wch: 55 }, // 배송지주소
    { wch: 28 }, // 남김말
    { wch: 14 }, // 자체코드
    { wch: 8 }, // 순서
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Simple');
  const rawBuffer = XLSX.write(workbook, { bookType: 'xls', bookSST: true, type: 'buffer' }) as Buffer;
  const buffer = wrapKidsnoteSellpiaXls(rawBuffer); // 셀피아 호환 메타 재조립 (KidsNote와 동일)
  return {
    buffer,
    fileName,
    sourceRows: orders.length,
    productRows: Math.max(0, aoa.length - 1 - orders.length),
    outputRows: aoa.length - 1,
    skippedRows: 0,
  };
}

// 셀피아 카카오(톡스토어) 업로드 양식 (45컬럼) — Kakao OMS export 형식 그대로. 배송준비중(301)만 passthrough.
const KAKAO_HEADERS = [
  '배송지/수신자정보 입력일', '주문상태', '주문번호', '채널상품번호', '상품명', '옵션', '수량', '배송방법', '택배사코드', '송장번호',
  '수령인명', '수령인연락처1', '하이픈포함 수령인연락처1', '수령인연락처2', '하이픈포함 수령인연락처2', '배송지주소', '우편번호', '배송메세지', '배송예정일', '주문일',
  '상품금액', '옵션금액', '판매자할인금액', '판매자쿠폰할인금액', '정산기준금액', '기본수수료', '노출추가수수료', '추천리워드수수료', '수수료할인금액', '채널',
  '브랜드', '모델명', '판매자상품번호', '옵션코드', '최초배송비번호', '배송비지불방법', '기본배송비 유형', '기본배송비 금액', '도서산간 추가 배송비 금액', '유입경로',
  '톡딜여부', '상품유형', 'biz판매여부 ', '이메일 정보', '순서',
] as const;

// "20260707105505" → "2026-07-07 10:55:05" (셀피아 카카오 양식의 날짜 표기). 8자리면 날짜만.
function kakaoDateTime(value: unknown): string {
  const s = String(value ?? '').replace(/\D/g, '');
  if (s.length < 8) return '';
  const date = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return s.length >= 14 ? `${date} ${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}` : date;
}

/** 카카오 주문(OMS `_search`) → 셀피아 45컬럼. ⭐배송준비중(statusCode 301)만 남기고 나머지는 스킵. */
function convertKakaoRows(orders: KakaoConvertOrder[], fileName: string): OrderCollectionConversion {
  const aoa: (string | number)[][] = [KAKAO_HEADERS.slice() as string[]];
  let seq = 0;
  let skipped = 0;
  for (const o of orders) {
    if (Number(o?.statusCode) !== 301) {
      skipped += 1; // 배송준비중이 아니면 제외 (확장이 이미 걸러도 방어적으로 재확인)
      continue;
    }
    seq += 1;
    const mobile = String(o?.receiverMobileNumber ?? '');
    const phone2 = String(o?.receiverPhoneNumber ?? '');
    aoa.push([
      kakaoDateTime(o?.deliveryAcceptedAt), // 0 배송지/수신자정보 입력일
      `${o?.statusCode ?? ''} ${o?.statusName ?? ''}`.trim(), // 1 주문상태 "301 배송 준비 중"
      String(o?.paymentId ?? ''), // 2 주문번호
      String(o?.itemId ?? ''), // 3 채널상품번호
      String(o?.itemName ?? ''), // 4 상품명
      String(o?.optionTitle ?? ''), // 5 옵션
      kidsnoteNum(o?.quantity) || 1, // 6 수량
      String(o?.shippingMethod ?? ''), // 7 배송방법
      String(o?.deliveryServiceCompanyId ?? ''), // 8 택배사코드
      String(o?.invoiceNumber ?? ''), // 9 송장번호
      String(o?.receiverName ?? ''), // 10 수령인명
      mobile.replace(/-/g, ''), // 11 수령인연락처1
      mobile, // 12 하이픈포함 수령인연락처1
      phone2.replace(/-/g, ''), // 13 수령인연락처2
      phone2, // 14 하이픈포함 수령인연락처2
      String(o?.address ?? ''), // 15 배송지주소
      String(o?.zoneCode ?? o?.postNo ?? ''), // 16 우편번호
      String(o?.requestMessage ?? ''), // 17 배송메세지
      '', // 18 배송예정일 (Kakao 응답에 없음)
      kakaoDateTime(o?.orderPaidAt), // 19 주문일
      kidsnoteNum(o?.standardPriceAmount), // 20 상품금액
      kidsnoteNum(o?.optionPriceAmount), // 21 옵션금액
      kidsnoteNum(o?.sellerDiscountAmount), // 22 판매자할인금액
      kidsnoteNum(o?.sellerDiscountCouponAmount), // 23 판매자쿠폰할인금액
      kidsnoteNum(o?.totalSellerPrice), // 24 정산기준금액
      kidsnoteNum(o?.commissionAmount), // 25 기본수수료
      kidsnoteNum(o?.additionalCommissionAmount), // 26 노출추가수수료
      kidsnoteNum(o?.afCommissionAmount), // 27 추천리워드수수료
      kidsnoteNum(o?.feeDiscountAmount), // 28 수수료할인금액
      String(o?.channelName ?? ''), // 29 채널
      String(o?.brandName ?? ''), // 30 브랜드
      '', // 31 모델명 (없음)
      String(o?.sellerItemNo ?? ''), // 32 판매자상품번호
      '', // 33 옵션코드 (없음)
      String(o?.deliveryOriginId ?? ''), // 34 최초배송비번호
      '', // 35 배송비지불방법 (없음)
      String(o?.deliveryAmountType ?? ''), // 36 기본배송비 유형
      kidsnoteNum(o?.baseDeliveryAmount), // 37 기본배송비 금액
      kidsnoteNum(o?.areaAdditionalAmount), // 38 도서산간 추가 배송비 금액
      String(o?.referrerType ?? ''), // 39 유입경로
      String(o?.talkDealOrder ?? ''), // 40 톡딜여부
      String(o?.itemType ?? ''), // 41 상품유형
      o?.b2b === true ? 'Y' : o?.b2b ? String(o.b2b) : '', // 42 biz판매여부
      '', // 43 이메일 정보
      seq, // 44 순서
    ]);
  }
  if (aoa.length <= 1) {
    throw new BadRequestException('변환할 배송준비중 카카오 주문이 없습니다.');
  }
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet0');
  const rawBuffer = XLSX.write(workbook, { bookType: 'xls', bookSST: true, type: 'buffer' }) as Buffer;
  const buffer = wrapKidsnoteSellpiaXls(rawBuffer); // 셀피아 호환 메타 재조립 (KidsNote와 동일)
  return {
    buffer,
    fileName,
    sourceRows: orders.length,
    productRows: 0,
    outputRows: aoa.length - 1,
    skippedRows: skipped,
  };
}

// 셀피아 키드키즈 업로드 양식 (17컬럼) — 주문서(logis_down5) 기반. 상품행 + 택배비행(3000 고정) 2행 구조.
const KIDKIDS_HEADERS = [
  '주문번호', '주문일자', '이름', '전화', '휴대폰', '우편번호', '주소', '상품명', '옵션', '수량',
  '공급단가', '합계', '박스수량', '배송요청사항', '배송구분', '배송단가', '키코드',
] as const;
const KIDKIDS_SHIPPING_FEE = 3000; // 택배비 고정 (원본 셀피아 export 전부 3000)

// "2026-07-01 13:55:47" → Excel 날짜 시리얼(날짜만). 실패 시 ''.
function kidkidsDateSerial(value: string): number | '' {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''));
  if (!m) return '';
  return Math.round(
    (Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - Date.UTC(1899, 11, 30)) / 86_400_000,
  );
}
function kidkidsClean(value: unknown): string {
  const s = String(value ?? '').trim();
  return s === '--' ? '' : s;
}

/** 키드키즈 주문(목록+주문서) → 셀피아 17컬럼. 이름=주문자명(유치원)+(키드키즈), 우편번호=주소 접두 5자리. */
function convertKidkidsRows(
  orders: KidkidsConvertOrder[],
  fileName: string,
  startOrderNo: number,
): OrderCollectionConversion {
  const aoa: (string | number)[][] = [KIDKIDS_HEADERS.slice() as string[]];
  const dateRows: number[] = []; // 주문일자(B열) 날짜서식 적용 행
  let orderNo = startOrderNo;
  let key = 0;
  let productRows = 0;
  for (const order of orders) {
    const items = Array.isArray(order?.items) ? order.items.filter((it) => kidkidsClean(it?.name)) : [];
    if (items.length === 0) continue;
    const name = `${kidkidsClean(order?.ordName)}(키드키즈)`;
    const tel = kidkidsClean(order?.recvTel);
    const mobile = kidkidsClean(order?.recvMobile);
    const rawAddr = String(order?.recvAddr ?? '').trim();
    const zipMatch = /^(\d{4,5})\s+/.exec(rawAddr);
    const zip: number | '' = zipMatch ? Number(zipMatch[1]) : '';
    const addr = rawAddr.replace(/^\d{4,5}\s+/, '').trim();
    const dser = kidkidsDateSerial(String(order?.orderDate ?? ''));
    const msg = kidkidsClean(order?.recvMsg);
    let first = true;
    for (const it of items) {
      key += 1;
      productRows += 1;
      aoa.push([
        orderNo, dser, name, tel, mobile, zip, addr,
        kidkidsClean(it?.name), '', kidsnoteNum(it?.qty), kidsnoteNum(it?.unit), kidsnoteNum(it?.sum),
        1, first ? msg : '', '', '', key,
      ]);
      dateRows.push(aoa.length - 1);
      first = false;
    }
    // 택배비 행 (주문당 1개, 3000 고정)
    key += 1;
    aoa.push([
      orderNo, dser, name, tel, mobile, zip, addr,
      '택배비', '', 1, KIDKIDS_SHIPPING_FEE, KIDKIDS_SHIPPING_FEE, '', '', '', '', key,
    ]);
    dateRows.push(aoa.length - 1);
    orderNo += 1;
  }
  if (aoa.length <= 1) {
    throw new BadRequestException('변환할 키드키즈 주문이 없습니다.');
  }
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  // 주문일자 셀에 날짜 서식 (원본 export = m/d/yy)
  for (const r of dateRows) {
    const ref = XLSX.utils.encode_cell({ r, c: 1 });
    const cellObj = sheet[ref] as { v?: unknown; t?: string; z?: string } | undefined;
    if (cellObj && typeof cellObj.v === 'number') {
      cellObj.t = 'n';
      cellObj.z = 'm/d/yy';
    }
  }
  sheet['!cols'] = [
    { wch: 10 }, { wch: 10 }, { wch: 26 }, { wch: 15 }, { wch: 15 }, { wch: 9 }, { wch: 55 },
    { wch: 46 }, { wch: 8 }, { wch: 7 }, { wch: 10 }, { wch: 11 }, { wch: 9 }, { wch: 30 },
    { wch: 9 }, { wch: 9 }, { wch: 7 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, kidkidsSheetName());
  const rawBuffer = XLSX.write(workbook, { bookType: 'xls', bookSST: true, type: 'buffer' }) as Buffer;
  const buffer = wrapKidsnoteSellpiaXls(rawBuffer); // 셀피아 호환 메타 재조립 (KidsNote와 동일)
  return {
    buffer,
    fileName,
    sourceRows: orders.length,
    productRows,
    outputRows: aoa.length - 1,
    skippedRows: 0,
  };
}

// 데이터 시트명 = 타임스탬프 (원본 셀피아 export 형식 "20260630094726").
function kidkidsSheetName(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function normalizeConvertedOutputRows(
  sourceRows: SourceRow[],
  fileName: string,
): OrderCollectionConversion {
  const mappedRows = sourceRows
    .filter((row) => OUTPUT_HEADERS.some((header) => cell(row, header) !== ''))
    .map((row) => mapConvertedOutputRow(row));
  const outputRows = renumberOutputRows(dedupeShippingRows(mappedRows));
  if (outputRows.length === 0) {
    throw new BadRequestException('변환할 주문 행이 없습니다.');
  }

  const productRows = outputRows.filter((row) => row.상품명 !== '' && row.상품명 !== '택배비').length;
  return buildConversionResult({
    outputRows,
    helperRows: outputRows.map((row) => outputRowToSourceRow(row)),
    fileName,
    sourceRows: sourceRows.length,
    productRows,
    skippedRows: sourceRows.length - outputRows.length,
  });
}

function buildConversionResult({
  outputRows,
  helperRows,
  fileName,
  sourceRows,
  productRows,
  skippedRows,
}: {
  outputRows: OutputRow[];
  helperRows: SourceRow[];
  fileName: string;
  sourceRows: number;
  productRows: number;
  skippedRows: number;
}): OrderCollectionConversion {
  const workbook = buildWorkbook(outputRows, helperRows);
  const buffer = XLSX.write(workbook, {
    bookType: 'xls',
    bookSST: true,
    type: 'buffer',
  }) as Buffer;

  return {
    buffer,
    fileName,
    sourceRows,
    productRows,
    outputRows: outputRows.length,
    skippedRows,
  };
}

function isConvertedOutput(headers: string[]): boolean {
  return OUTPUT_HEADERS.every((header) => headers.includes(header));
}

function mapConvertedOutputRow(source: SourceRow): OutputRow {
  const row = Object.fromEntries(
    OUTPUT_HEADERS.map((header) => [header, convertedOutputValue(header, cell(source, header))]),
  ) as OutputRow;
  row.수취인 = icecreamMallRecipient(source);
  return row;
}

function convertedOutputValue(header: OutputHeader, value: string): string | number {
  if (!NUMERIC_OUTPUT_HEADERS.has(header) || value === '') return value;
  const parsed = Number(value.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : value;
}

function outputRowToSourceRow(row: OutputRow): SourceRow {
  return Object.fromEntries(
    OUTPUT_HEADERS.map((header) => [header, String(row[header] ?? '')]),
  );
}

function dedupeShippingRows(rows: OutputRow[]): OutputRow[] {
  const result: OutputRow[] = [];
  const shippingIndexes = new Map<string, number>();

  for (const row of rows) {
    if (row.상품명 !== '택배비') {
      result.push(row);
      continue;
    }

    const key = `${row.주문번호}\u001f${row.배송번호}`;
    const existingIndex = shippingIndexes.get(key);
    if (existingIndex === undefined) {
      shippingIndexes.set(key, result.length);
      result.push(row);
      continue;
    }

    if (shippingRowPenalty(row) < shippingRowPenalty(result[existingIndex])) {
      result[existingIndex] = row;
    }
  }

  return result;
}

function shippingRowPenalty(row: OutputRow): number {
  let penalty = 0;
  if (row.배송순번 !== '') penalty += 1;
  if (row.주문내역상태 !== '') penalty += 1;
  if (row.사이트 !== '') penalty += 1;
  return penalty;
}

function renumberOutputRows(rows: OutputRow[]): OutputRow[] {
  return rows.map((row, index) => ({
    ...row,
    No: index + 1,
  }));
}

async function readSourceRows(
  file: MulterFile,
  options: OrderCollectionConversionOptions,
): Promise<SourceRow[]> {
  const workbook = await readWorkbook(file, options);
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const rows = XLSX.utils.sheet_to_json<Array<string | number | null | undefined>>(
    workbook.Sheets[sheetName],
    {
      header: 1,
      raw: false,
      defval: '',
    },
  );

  const headerRow = rows[0]?.map(normalizeCell) ?? [];
  return rows
    .slice(1)
    .filter((row) => row.some((value) => normalizeCell(value) !== ''))
    .map((row) => {
      const mapped: SourceRow = {};
      headerRow.forEach((header, index) => {
        if (!header) return;
        mapped[header] = normalizeCell(row[index]);
      });
      return mapped;
    });
}

async function readWorkbook(
  file: MulterFile,
  options: OrderCollectionConversionOptions,
): Promise<XLSX.WorkBook> {
  if (isSpreadsheetFile(file)) {
    const buffer = await decryptSpreadsheetBuffer(file.buffer, options.password);
    return readSpreadsheetWorkbook(buffer);
  }
  return XLSX.read(selectDelimitedText(file.buffer), { type: 'string', raw: false });
}

function isSpreadsheetFile(file: MulterFile): boolean {
  return /\.(xls|xlsx)$/i.test(file.originalname);
}

async function decryptSpreadsheetBuffer(
  buffer: Buffer,
  password: string | undefined,
): Promise<Buffer> {
  let encrypted = false;
  try {
    encrypted = officeCrypto.isEncrypted(buffer);
  } catch {
    encrypted = false;
  }

  if (!encrypted) return buffer;

  if (!password) {
    throw new BadRequestException('파일 비밀번호를 입력해주세요.');
  }

  try {
    return await officeCrypto.decrypt(buffer, { password });
  } catch (err) {
    const message = (err as Error).message;
    if (/password/i.test(message)) {
      throw new BadRequestException('파일 비밀번호가 맞지 않습니다.');
    }
    throw new BadRequestException('지원되지 않는 엑셀 암호화 형식입니다.');
  }
}

function readSpreadsheetWorkbook(buffer: Buffer): XLSX.WorkBook {
  try {
    return XLSX.read(buffer, { type: 'buffer' });
  } catch (err) {
    const message = (err as Error).message;
    if (/password|encrypted|decrypt/i.test(message)) {
      throw new BadRequestException('파일 비밀번호를 입력해주세요.');
    }
    throw new BadRequestException(
      '엑셀 파일을 읽을 수 없습니다. 아이스크림몰 주문 파일인지 확인해주세요.',
    );
  }
}

function selectDelimitedText(buffer: Buffer): string {
  const utf8 = stripBom(buffer.toString('utf8'));
  if (looksLikeOrderExport(utf8)) return utf8;

  const eucKr = stripBom(new TextDecoder('euc-kr').decode(buffer));
  if (looksLikeOrderExport(eucKr)) return eucKr;

  return utf8;
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function looksLikeOrderExport(text: string): boolean {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  return firstLine.includes('주문번호') && firstLine.includes('배송번호');
}

function validateInputHeaders(headers: string[]): void {
  const missing = REQUIRED_INPUT_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length > 0) {
    throw new BadRequestException(
      `필수 컬럼이 없습니다: ${missing.join(', ')}`,
    );
  }
}

function parseStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new BadRequestException(`${label} 값이 올바르지 않습니다.`);
  }
  return value.map(normalizeCell);
}

function parseRows(value: unknown): string[][] {
  if (!Array.isArray(value)) {
    throw new BadRequestException('rows 값이 올바르지 않습니다.');
  }
  return value.map((row) => parseStringArray(row, 'row'));
}

interface SellpiaTrackingRow {
  ordNo: string;
  itemNo: string;
  invNo: string;
  courier: string;
}

function parseSellpiaTracking(value: unknown): SellpiaTrackingRow[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new BadRequestException('tracking 값이 올바르지 않습니다.');
  }
  return value
    .map((raw) => {
      const r = (raw ?? {}) as Record<string, unknown>;
      return {
        ordNo: normalizeCell(r.ordNo as string).trim(),
        itemNo: normalizeCell(r.itemNo as string).trim(),
        invNo: normalizeCell(r.invNo as string).trim(),
        courier: normalizeCell(r.courier as string).trim(),
      };
    })
    .filter((r) => r.ordNo && r.invNo);
}

// 셀피아 택배사명(delicom) → 아이스크림몰 택배사코드(hdcCd). 공백/특수 제거 후 별칭 매칭.
// ⚠️실제 delicom 표기 샘플이 없어(배송완료 0건) 일반 별칭 기준 — 매칭 안 되면 unmappedCouriers 로 노출됨.
const COURIER_HDC_MAP: Record<string, string> = {
  cj대한통운: '10', cj택배: '10', 대한통운: '10', cj: '10', cjgls: '10',
  우체국: '11', 우체국택배: '11', 우체국등기: '11', epost: '11',
  로젠: '14', 로젠택배: '14', logen: '14',
  건영: '15', 건영택배: '15',
  경동: '16', 경동택배: '16',
  대신: '17', 대신택배: '17',
  롯데: '18', 롯데택배: '18', 롯데글로벌로지스: '18', 현대택배: '18',
  일양: '19', 일양로지스: '19',
  천일: '20', 천일택배: '20', 천일화물: '20',
  한진: '21', 한진택배: '21',
  합동: '22', 합동택배: '22',
  우리: '23', 우리택배: '23',
  홈픽: '24', 홈픽택배: '24',
  농협: '25', 농협택배: '25',
  gs편의점: '26', gs편의점택배: '26', gs25: '26', gs편의점반값택배: '26',
  딜리박스: '27',
  slx: '28', slx택배: '28',
  서림: '32', 서림택배: '32',
  직접배송: '40', 방문수령: '40', 매장수령: '40',
};

// 셀피아 택배사코드(delicom, 송장재출력) → 아이스크림몰 택배사코드(hdcCd). 셀피아는 자체 CJ대한통운 발송이라 1136 이 대부분.
// ⚠️다른 택배사 delicom 코드는 실 데이터 확인되면 추가.
const SELLPIA_DELICOM_TO_HDC: Record<string, string> = {
  '1136': '10', // CJ대한통운
};

// 셀피아 택배사코드(delicom) → 도매꾹 택배사코드(com/lDeliCom). 셀피아=CJ(1136)→도매꾹 DAEHAN.
const SELLPIA_DELICOM_TO_DOMEGGOOK: Record<string, string> = {
  '1136': 'DAEHAN', // CJ대한통운
};

function courierToHdcCd(courier: string): string {
  const raw = (courier ?? '').trim();
  if (!raw) return '';
  // 셀피아 delicom 은 숫자 코드로 온다(예 1136). 코드 매핑 우선, 없으면 택배사명 별칭 매칭.
  if (/^\d+$/.test(raw)) return SELLPIA_DELICOM_TO_HDC[raw] ?? '';
  const key = raw.toLowerCase().replace(/[\s()（）_/-]+/g, '');
  return COURIER_HDC_MAP[key] ?? '';
}

function mapSourceRow(headers: string[], row: string[]): SourceRow {
  const mapped: SourceRow = {};
  headers.forEach((header, index) => {
    if (!header) return;
    mapped[header] = normalizeCell(row[index]);
  });
  return mapped;
}

function buildOutputRows(sourceRows: SourceRow[]): OutputRow[] {
  const groups = groupByDelivery(sourceRows);
  const outputRows: OutputRow[] = [];
  let rowNumber = 1;

  for (const group of groups) {
    group.rows.forEach((source, index) => {
      outputRows.push(makeProductRow(rowNumber, source, index + 1));
      rowNumber += 1;
    });

    outputRows.push(makeShippingFeeRow(rowNumber, group.rows[0]));
    rowNumber += 1;
  }

  return outputRows;
}

function groupByDelivery(sourceRows: SourceRow[]): Array<{ key: string; rows: SourceRow[] }> {
  const groups: Array<{ key: string; rows: SourceRow[] }> = [];
  const byKey = new Map<string, { key: string; rows: SourceRow[] }>();

  for (const row of sourceRows) {
    const key = `${cell(row, '주문번호')}\u001f${cell(row, '배송번호')}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.rows.push(row);
      continue;
    }
    const group = { key, rows: [row] };
    byKey.set(key, group);
    groups.push(group);
  }

  return groups;
}

function makeEmptyOutputRow(rowNumber: number, source: SourceRow): OutputRow {
  const row = Object.fromEntries(
    OUTPUT_HEADERS.map((header) => [header, '']),
  ) as OutputRow;
  row.No = rowNumber;
  row.주문번호 = cell(source, '주문번호');
  row.배송번호 = cell(source, '배송번호');
  return row;
}

function makeProductRow(rowNumber: number, source: SourceRow, deliverySeq: number): OutputRow {
  const row = makeEmptyOutputRow(rowNumber, source);
  row.사이트 = cell(source, '사이트');
  row.배송순번 = deliverySeq;
  row.주문완료일시 = cell(source, '주문완료일시');
  row.주문내역상태 = '출고지시';
  row.배송종류 = cell(source, '배송종류');
  row.배송처리유형 = cell(source, '배송처리유형');
  row.주문판매유형 = cell(source, '주문판매유형');
  row.합배송여부 = cell(source, '합배송여부');
  row.상품번호 = cell(source, '상품번호');
  row.상품명 = cell(source, '상품명');
  row.단품명 = cell(source, '단품명');
  row.출고수량 = cell(source, '출고수량');
  row.바코드 = cell(source, '바코드');
  row.증정품 = cell(source, '추가입력옵션') || cell(source, '증정품');
  row.정상가 = cell(source, '정상가');
  row.판매가 = cell(source, '판매가');
  row['판매가(합계)'] = cell(source, '판매가(합계)');
  row.공급가 = cell(source, '공급가');
  row['공급가(합계)'] = cell(source, '공급가(합계)');
  row.배송비 = cell(source, '배송비');
  row.Y주문번호 = cell(source, 'Y주문번호');
  row.입점사 = cell(source, '입점사');
  row.회원ID = cell(source, '회원ID');
  row.주문자 = cell(source, '주문자');
  row.주문자휴대폰번호 = ordererPhone(source);
  row.수취인 = icecreamMallRecipient(source);
  row.수취인휴대폰번호 = cell(source, '수취인휴대폰번호');
  row.우편번호 = cell(source, '우편번호');
  row.배송지 = cell(source, '배송지');
  row.배송요청사항 = cell(source, '배송요청사항') || '-';
  row.출고지시일시 = cell(source, '출고지시일시');
  return row;
}

function makeShippingFeeRow(rowNumber: number, source: SourceRow): OutputRow {
  const row = makeEmptyOutputRow(rowNumber, source);
  row.상품명 = '택배비';
  row.출고수량 = 1;
  row.공급가 = SHIPPING_FEE;
  row.주문자 = cell(source, '주문자');
  row.주문자휴대폰번호 = ordererPhone(source);
  row.수취인 = icecreamMallRecipient(source);
  row.수취인휴대폰번호 = cell(source, '수취인휴대폰번호');
  row.우편번호 = cell(source, '우편번호');
  row.배송지 = cell(source, '배송지');
  return row;
}

function buildWorkbook(outputRows: OutputRow[], sourceRows: SourceRow[]): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  workbook.Props = {
    Author: 'Apache POI',
    LastAuthor: 'com',
    Application: 'Apache POI',
    AppVersion: '16.0000',
    DocSecurity: '0',
  };
  const deliverySheet = XLSX.utils.aoa_to_sheet([
    [...OUTPUT_HEADERS],
    ...outputRows.map((row) => OUTPUT_HEADERS.map((header) => row[header])),
  ]);
  deliverySheet['!cols'] = OUTPUT_COLUMN_WIDTHS.map((wch) => ({ wch }));
  deliverySheet['!freeze'] = { xSplit: 0, ySplit: 1 };
  styleHeaderRow(deliverySheet);
  XLSX.utils.book_append_sheet(workbook, deliverySheet, 'deliveryMgmt1');

  const helperSheet = buildRecipientHelperSheet(sourceRows);
  XLSX.utils.book_append_sheet(workbook, helperSheet, 'Sheet1');
  workbook.Workbook = {
    Sheets: workbook.SheetNames.map((name) => ({ name, Hidden: 0 })),
    WBProps: { date1904: false },
    Views: [{}],
  };
  return workbook;
}

function styleHeaderRow(sheet: XLSX.WorkSheet): void {
  for (let index = 0; index < OUTPUT_HEADERS.length; index += 1) {
    const address = XLSX.utils.encode_cell({ r: 0, c: index });
    const cellRef = sheet[address];
    if (!cellRef) continue;
    cellRef.s = {
      patternType: 'solid',
      fgColor: { rgb: 'C0C0C0' },
      bgColor: { rgb: 'FFFFFF' },
    };
  }
}

function buildRecipientHelperSheet(sourceRows: SourceRow[]): XLSX.WorkSheet {
  const recipients = unique(
    sourceRows
      .map((row) => baseIcecreamMallRecipient(cell(row, '수취인')))
      .filter(Boolean),
  );
  const rows = [
    ['', '수취인', ''],
    ...recipients.map((recipient) => ['(아이스크림몰)', recipient, `${recipient}(아이스크림몰)`]),
  ];
  const sheet = XLSX.utils.aoa_to_sheet([[]]);
  XLSX.utils.sheet_add_aoa(sheet, rows, { origin: 'C1' });
  sheet['!cols'] = [{ wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 20 }, { wch: 30 }];

  recipients.forEach((_recipient, index) => {
    const rowNumber = index + 2;
    const address = `E${rowNumber}`;
    sheet[address] = {
      t: 's',
      v: rows[index + 1]?.[2] ?? '',
      f: `D${rowNumber}&C${rowNumber}`,
    };
  });

  return sheet;
}

function cell(row: SourceRow, header: string): string {
  return row[header]?.trim() ?? '';
}

function normalizeCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function ordererPhone(source: SourceRow): string {
  return cell(source, '주문자휴대폰번호') || cell(source, '수취인휴대폰번호');
}

function icecreamMallRecipient(source: SourceRow): string {
  const recipient = baseIcecreamMallRecipient(cell(source, '수취인'));
  if (!recipient) return '';
  return `${recipient}(아이스크림몰)`;
}

function baseIcecreamMallRecipient(value: string): string {
  let recipient = value.trim();
  while (recipient.endsWith('(아이스크림몰)')) {
    recipient = recipient.slice(0, -'(아이스크림몰)'.length).trim();
  }
  return recipient;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function buildOutputFileName(inputName: string): string {
  const normalizedInputName = normalizeUploadFileName(inputName);
  const extension = extname(normalizedInputName);
  const base = basename(normalizedInputName, extension).replace(/[\\/:*?"<>|]+/g, '_');
  return `${withSingleOutputSuffix(base || '주문수집')}.xls`;
}

function withSingleOutputSuffix(value: string): string {
  let base = value;
  while (base.endsWith(`${OUTPUT_FILE_SUFFIX}${OUTPUT_FILE_SUFFIX}`)) {
    base = base.slice(0, -OUTPUT_FILE_SUFFIX.length);
  }
  return base.endsWith(OUTPUT_FILE_SUFFIX) ? base : `${base}${OUTPUT_FILE_SUFFIX}`;
}

function normalizeUploadFileName(inputName: string): string {
  let current = inputName;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const repaired = repairLatin1DecodedUtf8(current);
    if (!repaired || repaired === current) break;
    current = repaired;
  }
  return current.normalize('NFC');
}

function repairLatin1DecodedUtf8(inputName: string): string | null {
  if (containsHangul(inputName) && !containsControlCharacters(inputName)) return null;

  try {
    const repaired = Buffer.from(inputName, 'latin1').toString('utf8');
    if (repaired.includes('\uFFFD')) return null;
    if (containsHangul(repaired) && !containsHangul(inputName)) return repaired;
    if (containsControlCharacters(inputName) && repaired !== inputName) return repaired;
    return null;
  } catch {
    return null;
  }
}

function containsHangul(value: string): boolean {
  return /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/.test(value);
}

function containsControlCharacters(value: string): boolean {
  return /[\u0000-\u001F\u007F-\u009F]/.test(value);
}

function dayStamp(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}
