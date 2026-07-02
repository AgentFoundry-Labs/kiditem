import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import officeCrypto = require('officecrypto-tool');
import * as XLSX from 'xlsx';

import type { MulterFile } from '../../../common/types';
import { OrderCollectionService } from '../order-collection.service';

const SOURCE_HEADERS = [
  'No',
  '주문번호',
  '배송번호',
  '사이트',
  '주문완료일시',
  '주문구분',
  '주문내역구분',
  '주문내역상태',
  '배송유형',
  '배송종류',
  '배송처리유형',
  '택배사',
  '송장번호',
  '배송조회',
  '주문판매유형',
  '거래명세서동봉여부',
  '합배송여부',
  '직배변경 사유',
  '상품번호',
  '상품명',
  '단품명',
  '출고수량',
  '추가입력옵션',
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
  '수취인',
  '수취인휴대폰번호',
  '우편번호',
  '배송지',
  '배송요청사항',
  '배송지시일시',
  '출고지시일시',
  '출고완료일시',
];

function makeRow(overrides: Record<string, string>): string[] {
  const defaults: Record<string, string> = {
    No: '1',
    주문번호: '20260623M664721',
    배송번호: '115881570',
    사이트: '아이스크림몰',
    주문완료일시: '2026-06-23 08:36:27',
    주문구분: '일반주문',
    주문내역구분: '주문일반',
    주문내역상태: '출고완료',
    배송유형: '정상출하',
    배송종류: '일반배송',
    배송처리유형: '업체배송',
    택배사: 'CJ대한통운',
    송장번호: '576994547755',
    배송조회: '조회',
    주문판매유형: '일반판매',
    거래명세서동봉여부: 'N',
    합배송여부: 'N',
    상품번호: '10097673',
    상품명: '카피바라 비눗방울',
    단품명: '단일상품',
    출고수량: '1',
    추가입력옵션: '-',
    정상가: '16800',
    판매가: '11150',
    '판매가(합계)': '11150',
    공급가: '8363',
    '공급가(합계)': '8363',
    배송비: '0',
    입점사: '주식회사 거영I&D',
    회원ID: '125-83-03537',
    주문자: '비룡초등학교',
    수취인: '강명숙선생님',
    수취인휴대폰번호: '010-3204-1191',
    우편번호: '17570',
    배송지: '경기도 안성시 비룡로 78',
    배송요청사항: '',
    배송지시일시: '2026-06-23 08:50:04',
    출고지시일시: '2026-06-23 14:19:40',
  };
  return SOURCE_HEADERS.map((header) => overrides[header] ?? defaults[header] ?? '');
}

function makeUploadFile(rows: string[][]): MulterFile {
  const text = [SOURCE_HEADERS, ...rows].map((row) => row.join('\t')).join('\n');
  const buffer = Buffer.from(text, 'utf8');
  return {
    fieldname: 'file',
    originalname: 'icecream-orders.txt',
    encoding: '7bit',
    mimetype: 'text/plain',
    size: buffer.length,
    buffer,
  };
}

function withOriginalName(file: MulterFile, originalname: string): MulterFile {
  return {
    ...file,
    originalname,
  };
}

function makeXlsxUploadFile(rows: string[][]): MulterFile {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([SOURCE_HEADERS, ...rows]),
    '주문내역',
  );
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
  return {
    fieldname: 'file',
    originalname: 'icecream-orders.xlsx',
    encoding: '7bit',
    mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: buffer.length,
    buffer,
  };
}

function makeEncryptedXlsxUploadFile(rows: string[][], password: string): MulterFile {
  const file = makeXlsxUploadFile(rows);
  const buffer = officeCrypto.encrypt(file.buffer, { password });
  return {
    ...file,
    size: buffer.length,
    buffer,
  };
}

function readOutputRows(buffer: Buffer): string[][] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  return XLSX.utils.sheet_to_json(workbook.Sheets.deliveryMgmt1, {
    header: 1,
    raw: false,
    defval: '',
  }) as string[][];
}

function readOutputWorkbook(buffer: Buffer): XLSX.WorkBook {
  return XLSX.read(buffer, { type: 'buffer', cellFormula: true });
}

function makeXlsUploadFileFromRows(rows: string[][], originalname: string): MulterFile {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'deliveryMgmt1');
  const buffer = XLSX.write(workbook, { bookType: 'xls', type: 'buffer' }) as Buffer;
  return {
    fieldname: 'file',
    originalname,
    encoding: '7bit',
    mimetype: 'application/vnd.ms-excel',
    size: buffer.length,
    buffer,
  };
}

describe('OrderCollectionService', () => {
  it('converts every product order row into deliveryMgmt1 rows with shipping-fee rows', async () => {
    const service = new OrderCollectionService();
    const result = await service.convertIcecreamMallOrderFile(makeUploadFile([
      makeRow({}),
      makeRow({
        No: '2',
        주문번호: '20260623M664891',
        배송번호: '115882141',
        주문내역상태: '배송지시',
        상품번호: '11287755',
      }),
      makeRow({
        No: '3',
        주문번호: '20260623M664751',
        배송번호: '115881626',
        주문내역상태: '출고지시',
        상품번호: '11047905',
        상품명: '애니멀 블럭',
        단품명: '1000애니멀(오션)블럭',
        출고수량: '15',
        수취인: '윤다은',
        수취인휴대폰번호: '010-3834-3059',
      }),
    ]));

    const rows = readOutputRows(result.buffer);

    expect(result).toMatchObject({
      sourceRows: 3,
      productRows: 3,
      outputRows: 6,
      skippedRows: 0,
      fileName: 'icecream-orders_아이스크림몰_변환.xls',
    });
    expect(rows[0]?.slice(0, 5)).toEqual(['No', '주문번호', '배송번호', '사이트', '배송순번']);
    expect(rows[1]?.slice(0, 18)).toEqual([
      '1',
      '20260623M664721',
      '115881570',
      '아이스크림몰',
      '1',
      '',
      '',
      '',
      '2026-06-23 08:36:27',
      '출고지시',
      '일반배송',
      '업체배송',
      '일반판매',
      'N',
      '10097673',
      '카피바라 비눗방울',
      '단일상품',
      '1',
    ]);
    expect(rows[1]?.[31]).toBe('강명숙선생님(아이스크림몰)');
    expect(rows[1]?.[35]).toBe('-');
    expect(rows[1]?.[36]).toBe('2026-06-23 14:19:40');
    expect(rows[2]?.[15]).toBe('택배비');
    expect(rows[2]?.[17]).toBe('1');
    expect(rows[2]?.[23]).toBe('3000');
    expect(rows[3]?.[14]).toBe('11287755');
    expect(rows[3]?.[9]).toBe('출고지시');
    expect(rows[4]?.[15]).toBe('택배비');
    expect(rows[5]?.[15]).toBe('애니멀 블럭');
    expect(rows[6]?.[15]).toBe('택배비');
  });

  it('writes a Cellpia upload workbook as a single xls file shape', async () => {
    const service = new OrderCollectionService();
    const result = await service.convertIcecreamMallOrderFile(makeUploadFile([makeRow({})]));
    const workbook = readOutputWorkbook(result.buffer);

    expect(result.fileName).toBe('icecream-orders_아이스크림몰_변환.xls');
    expect(result.buffer.subarray(0, 8).toString('hex')).toBe('d0cf11e0a1b11ae1');
    expect(workbook.SheetNames).toEqual(['deliveryMgmt1', 'Sheet1']);
    expect(workbook.Props?.Application).toBe('Apache POI');
    expect(workbook.Props?.Author).toBe('Apache POI');
    expect(workbook.Sheets.deliveryMgmt1?.['!ref']).toBe('A1:AU3');
  });

  it('keeps orderer phone when the upload contains 주문자휴대폰번호', async () => {
    const service = new OrderCollectionService();
    const headers = [...SOURCE_HEADERS, '주문자휴대폰번호'];
    const row = [...makeRow({}), '010-0000-1111'];
    const text = [headers, row].map((line) => line.join('\t')).join('\n');
    const buffer = Buffer.from(text, 'utf8');

    const result = await service.convertIcecreamMallOrderFile({
      fieldname: 'file',
      originalname: 'with-phone.tsv',
      encoding: '7bit',
      mimetype: 'text/tab-separated-values',
      size: buffer.length,
      buffer,
    });

    const rows = readOutputRows(result.buffer);
    expect(rows[1]?.[30]).toBe('010-0000-1111');
    expect(rows[2]?.[30]).toBe('010-0000-1111');
  });

  it('converts browser-collected Icecream Mall grid rows without an uploaded file', () => {
    const service = new OrderCollectionService();
    const result = service.convertIcecreamMallOrderRows({
      headers: SOURCE_HEADERS,
      rows: [makeRow({ 수취인: '윤다은', 수취인휴대폰번호: '010-3834-3059' })],
      fileName: '아이스크림몰_20260623_브라우저수집',
    });

    const rows = readOutputRows(result.buffer);
    expect(result).toMatchObject({
      sourceRows: 1,
      productRows: 1,
      outputRows: 2,
      fileName: '아이스크림몰_20260623_브라우저수집_아이스크림몰_변환.xls',
    });
    expect(rows[1]?.[1]).toBe('20260623M664721');
    expect(rows[1]?.[31]).toBe('윤다은(아이스크림몰)');
    expect(rows[2]?.[15]).toBe('택배비');
  });

  it('does not add another shipping row when a converted Cellpia file is uploaded again', async () => {
    const service = new OrderCollectionService();
    const firstResult = await service.convertIcecreamMallOrderFile(makeUploadFile([makeRow({})]));

    const secondResult = await service.convertIcecreamMallOrderFile({
      fieldname: 'file',
      originalname: firstResult.fileName,
      encoding: '7bit',
      mimetype: 'application/vnd.ms-excel',
      size: firstResult.buffer.length,
      buffer: firstResult.buffer,
    });

    const rows = readOutputRows(secondResult.buffer);
    expect(secondResult).toMatchObject({
      sourceRows: 2,
      productRows: 1,
      outputRows: 2,
      skippedRows: 0,
      fileName: 'icecream-orders_아이스크림몰_변환.xls',
    });
    expect(rows).toHaveLength(3);
    expect(rows[1]?.[15]).toBe('카피바라 비눗방울');
    expect(rows[1]?.[31]).toBe('강명숙선생님(아이스크림몰)');
    expect(rows[2]?.[15]).toBe('택배비');
    expect(rows[2]?.[31]).toBe('강명숙선생님(아이스크림몰)');
  });

  it('deduplicates legacy double-converted shipping rows', async () => {
    const service = new OrderCollectionService();
    const firstResult = await service.convertIcecreamMallOrderFile(makeUploadFile([makeRow({})]));
    const rows = readOutputRows(firstResult.buffer);
    const duplicatedShipping = [...rows[2]];
    duplicatedShipping[4] = '2';
    duplicatedShipping[9] = '출고지시';
    const file = makeXlsUploadFileFromRows(
      [rows[0], rows[1], duplicatedShipping, rows[2]],
      'icecream-orders_아이스크림몰_변환_아이스크림몰_변환.xls',
    );

    const result = await service.convertIcecreamMallOrderFile(file);
    const normalizedRows = readOutputRows(result.buffer);

    expect(result).toMatchObject({
      productRows: 1,
      outputRows: 2,
      fileName: 'icecream-orders_아이스크림몰_변환.xls',
    });
    expect(normalizedRows).toHaveLength(3);
    expect(normalizedRows[1]?.[0]).toBe('1');
    expect(normalizedRows[2]?.[0]).toBe('2');
    expect(normalizedRows[2]?.[4]).toBe('');
    expect(normalizedRows[2]?.[9]).toBe('');
    expect(normalizedRows[2]?.[15]).toBe('택배비');
  });

  it('repairs mojibake Korean upload filenames before building the download name', async () => {
    const service = new OrderCollectionService();
    const singleMojibakeName = Buffer.from(
      '26.06.23아이스크림몰.txt'.normalize('NFD'),
      'utf8',
    ).toString('latin1');
    const doubleMojibakeName = Buffer.from(singleMojibakeName, 'utf8').toString('latin1');

    const result = await service.convertIcecreamMallOrderFile(
      withOriginalName(makeUploadFile([makeRow({})]), doubleMojibakeName),
    );

    expect(result.fileName).toBe('26.06.23아이스크림몰_아이스크림몰_변환.xls');
  });

  it('decrypts a password-protected Excel upload when a password is supplied', async () => {
    const service = new OrderCollectionService();
    const result = await service.convertIcecreamMallOrderFile(
      makeEncryptedXlsxUploadFile([makeRow({})], 'icecream'),
      { password: 'icecream' },
    );

    const rows = readOutputRows(result.buffer);
    expect(result).toMatchObject({
      sourceRows: 1,
      productRows: 1,
      outputRows: 2,
    });
    expect(rows[1]?.[15]).toBe('카피바라 비눗방울');
    expect(rows[2]?.[15]).toBe('택배비');
  });

  it('returns actionable errors for password-protected Excel uploads', async () => {
    const service = new OrderCollectionService();
    const file = makeEncryptedXlsxUploadFile([makeRow({})], 'icecream');

    await expect(service.convertIcecreamMallOrderFile(file)).rejects.toMatchObject({
      response: { message: '파일 비밀번호를 입력해주세요.' },
    });
    await expect(
      service.convertIcecreamMallOrderFile(file, { password: 'wrong' }),
    ).rejects.toMatchObject({
      response: { message: '파일 비밀번호가 맞지 않습니다.' },
    });
  });

  it('throws when required order columns are missing', async () => {
    const service = new OrderCollectionService();
    const buffer = Buffer.from('No\t상품명\n1\t테스트', 'utf8');

    await expect(
      service.convertIcecreamMallOrderFile({
        fieldname: 'file',
        originalname: 'bad.tsv',
        encoding: '7bit',
        mimetype: 'text/tab-separated-values',
        size: buffer.length,
        buffer,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
