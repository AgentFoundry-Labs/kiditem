import { BadRequestException, Injectable } from '@nestjs/common';
import officeCrypto = require('officecrypto-tool');
import * as XLSX from 'xlsx';
import { TextDecoder } from 'util';
import { basename, extname } from 'path';

import type { MulterFile } from '../../common/types';

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
}

function convertIcecreamMallRows(
  sourceRows: SourceRow[],
  fileName: string,
): OrderCollectionConversion {
    if (sourceRows.length === 0) {
      throw new BadRequestException('변환할 주문 행이 없습니다.');
    }

    validateInputHeaders(Object.keys(sourceRows[0] ?? {}));

    const includedRows = sourceRows.filter((row) => cell(row, '상품명') !== '');
    if (includedRows.length === 0) {
      throw new BadRequestException('변환할 상품 주문 행이 없습니다.');
    }

    const outputRows = buildOutputRows(includedRows);
    const workbook = buildWorkbook(outputRows, includedRows);
    const buffer = XLSX.write(workbook, {
      bookType: 'xlsx',
      type: 'buffer',
    }) as Buffer;

    return {
      buffer,
      fileName,
      sourceRows: sourceRows.length,
      productRows: includedRows.length,
      outputRows: outputRows.length,
      skippedRows: sourceRows.length - includedRows.length,
    };
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
  const recipients = unique(sourceRows.map((row) => cell(row, '수취인')).filter(Boolean));
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
  const recipient = cell(source, '수취인');
  if (!recipient || recipient.endsWith('(아이스크림몰)')) return recipient;
  return `${recipient}(아이스크림몰)`;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function buildOutputFileName(inputName: string): string {
  const normalizedInputName = normalizeUploadFileName(inputName);
  const extension = extname(normalizedInputName);
  const base = basename(normalizedInputName, extension).replace(/[\\/:*?"<>|]+/g, '_');
  return `${base || '주문수집'}_아이스크림몰_변환.xlsx`;
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
