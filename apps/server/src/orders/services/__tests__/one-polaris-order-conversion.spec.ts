import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  ONE_POLARIS_SELLPIA_HEADERS,
  excelSerialFromDate,
  findOnePolarisAddress,
  findOnePolarisPrice,
  isOnePolarisSellpiaTemplate,
  stripOnePolarisProductTag,
  type OnePolarisSellpiaTemplate,
} from '../../domain/one-polaris-sellpia-order';
import { OrderCollectionService } from '../order-collection.service';
import type { MulterFile } from '../../../common/types';

function upload(name: string, buffer: Buffer): MulterFile {
  return {
    fieldname: 'file',
    originalname: name,
    encoding: '7bit',
    mimetype: 'application/octet-stream',
    size: buffer.length,
    buffer,
  };
}

/** 사장님 양식샘플 xls 모양: Sheet1(상품 목록) · 단가 · 주문서 · 주소록 · 양식. */
function templateXls(options: { withAddresses?: boolean } = {}): Buffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([['순번', '구분', '제품명'], [707, '삭제', '산타젤리불빛팔찌']]),
    'Sheet1',
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['', '제안시기', '상품명', '공급단가', '판매단위', '판매단위 공급단가 (택배비 포함)', '키드가'],
      ['', '', '메달(상)', 808, '40개', 30600, 850],
      ['', '', '3000 3in1롤리팝야광봉', 1260, 24, 30240, ''],
      ['', '24년11월', '3000 3in1롤리팝야광봉', 1567.5, 24, 37620, ''],
      ['', '', '6000DIY병원놀이세트', 3140, 10, 31400, ''],
      ['', '', '단가없는상품', '', 1, '', ''],
      ['', '', '2000포켓몬왕종합장', '1,140', 30, 34200, ''],
      ['', '', '', '', '', '', ''],
    ]),
    '단가',
  );
  if (options.withAddresses !== false) {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['본부', '본부명', '단명', '저장 위치 내역', '지부점명', '우편번호', '주소', '전화번호'],
        ['', '신기한남부총국', '신기한남부지역국(가)', '대구지점', '대구지점', '41963', '대구 중구 명덕로 203, 우석빌딩 5층', '053-422-0970'],
        ['', '플라톤강남총국', '', '대구중앙플라톤센터', '대구중앙플라톤센터', 3908, '서울특별시 마포구 월드컵북로 361', '02-2001-5470'],
        ['', '신기한온라인총국(가)', '온라인지역국', '온라인지점', '온라인지점', ' ', ' ', ' '],
        ['', '플라톤남서총국', '', '광주서북지국', '광주서북지국', '61982', '광주광역시 서구 화정로 259 6층 604호', '062-514-3810'],
        ['', '', '', '', '', '', '', ''],
      ]),
      '주소록',
    );
  }
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([ONE_POLARIS_SELLPIA_HEADERS.slice()]),
    '양식',
  );
  return XLSX.write(workbook, { bookType: 'xls', type: 'buffer' }) as Buffer;
}

/** 메일 첨부 buy_List 모양: 두 줄 비우고 셋째 줄이 머리행. */
function orderXlsx(rows: unknown[][]): Buffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      [],
      [],
      ['순번', '구분', '구매일', '제품명', '수량', '본부명', '지점명', '사용포인트', '배송지'],
      ...rows,
    ], { cellDates: true }),
    'buy_List(2021-2-3) (1)',
  );
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer', cellDates: true }) as Buffer;
}

function readOutput(buffer: Buffer): { sheetName: string; rows: unknown[][]; sheet: XLSX.WorkSheet } {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false, cellNF: true });
  const sheetName = workbook.SheetNames[0] ?? '';
  const sheet = workbook.Sheets[sheetName]!;
  return {
    sheetName,
    sheet,
    rows: XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: '' }),
  };
}

const col = (letter: string) => XLSX.utils.decode_col(letter);

/** 읽는 쪽 SheetJS 가 날짜 서식 숫자를 Date 로 돌려줘도 파일 안의 값은 일련번호다. */
function serialOf(value: unknown): unknown {
  return value instanceof Date ? excelSerialFromDate(value) : value;
}

describe('원폴라리스 메일 주문 → 셀피아 양식', () => {
  const service = new OrderCollectionService();

  it('⭐ 양식 xls 에서 주소록 · 단가 표를 읽는다 — VLOOKUP 처럼 순서를 지키고, 우편번호 앞자리 0 을 살린다', () => {
    const template = service.parseOnePolarisSellpiaTemplateFile(upload('양식샘플__26.09.21.(최신) 1.xls', templateXls()));

    expect(template.fileName).toBe('양식샘플__26.09.21.(최신) 1.xls');
    expect(template.addresses.map((entry) => entry.site)).toEqual([
      '대구지점', '대구중앙플라톤센터', '온라인지점', '광주서북지국',
    ]);
    expect(template.addresses[1]).toEqual({
      site: '대구중앙플라톤센터',
      zip: '03908',
      address: '서울특별시 마포구 월드컵북로 361',
      phone: '02-2001-5470',
    });
    // 단가가 숫자가 아닌 줄은 표에 없고, 같은 이름은 적힌 순서대로 남는다(첫 줄이 이긴다).
    expect(template.prices).toEqual([
      { name: '메달(상)', cost: 808 },
      { name: '3000 3in1롤리팝야광봉', cost: 1260 },
      { name: '3000 3in1롤리팝야광봉', cost: 1567.5 },
      { name: '6000DIY병원놀이세트', cost: 3140 },
      { name: '2000포켓몬왕종합장', cost: 1140 },
    ]);
    expect(isOnePolarisSellpiaTemplate(JSON.parse(JSON.stringify(template)))).toBe(true);
  });

  it('양식 파일에 주소록 시트가 없으면 그 이름을 대며 거절한다', () => {
    expect(() => service.parseOnePolarisSellpiaTemplateFile(upload('양식.xls', templateXls({ withAddresses: false }))))
      .toThrow(/'주소록' 시트가 없습니다/);
    expect(() => service.parseOnePolarisSellpiaTemplateFile(upload('메모.txt', Buffer.from('not a workbook'))))
      .toThrow(BadRequestException);
  });

  it('⭐ 메일 주문 엑셀을 양식 23칸으로 채운다 — 배송지로 주소록을, 상품명으로 단가를 찾고 R = 수량 × S', () => {
    const template = service.parseOnePolarisSellpiaTemplateFile(upload('양식.xls', templateXls()));
    const result = service.convertOnePolarisOrderFile(
      upload('한솔교육폐쇄몰 9월 8차.xlsx', orderXlsx([
        ['', '', new Date(2026, 8, 15), '6000diy병원놀이세트_[G]', 20, '교육사업본부', '대구지점', 80000, '대구지점'],
        ['', '', new Date(2026, 8, 14), '메달(상)_[G]', 3, '플라톤강남총국', '대구중앙플라톤센', 2550, '대구중앙플라톤센'],
        ['', '', '2026-09-14', '없는상품_[G]', 2, '교육사업본부', '없는지점', 0, '없는지점'],
        ['', '', '', '', '', '', '', '', ''],
        ['', '', new Date(2026, 8, 14), '', 5, '교육사업본부', '대구지점', 0, '대구지점'],
      ])),
      template,
    );

    expect(result.fileName).toMatch(/^원폴라리스_\d{8}_변환\.xls$/);
    expect(result).toMatchObject({ sourceRows: 4, productRows: 0, outputRows: 3, skippedRows: 1 });
    // 셀피아가 읽는 OLE2 파일이다.
    expect(result.buffer.subarray(0, 4)).toEqual(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]));

    const output = readOutput(result.buffer);
    expect(output.sheetName).toBe('양식');
    expect(output.rows[0]).toEqual(ONE_POLARIS_SELLPIA_HEADERS.slice());

    const first = output.rows[1]!;
    expect(first[col('C')]).toBe('대구지점');
    expect(first[col('D')]).toBe('053-422-0970');
    expect(first[col('E')]).toBe('대구지점');
    expect(first[col('F')]).toBe('053-422-0970');
    expect(first[col('G')]).toBe('41963');
    expect(first[col('H')]).toBe('대구 중구 명덕로 203, 우석빌딩 5층');
    expect(first[col('K')]).toBe('6000diy병원놀이세트'); // 꼬리 `_[G]` 를 뗀 이름, 단가 시트와 대소문자만 다르다
    expect(first[col('M')]).toBe(20);
    expect(first[col('S')]).toBe(3140);
    expect(first[col('R')]).toBe(62800);
    expect(serialOf(first[col('V')])).toBe(excelSerialFromDate(new Date(2026, 8, 15)));
    expect(output.sheet[XLSX.utils.encode_cell({ r: 1, c: col('V') })]?.z).toBe('m/d/yy');
    // 사장님 양식에서도 비어 있는 칸은 비어 있다.
    for (const letter of ['A', 'B', 'I', 'J', 'L', 'N', 'O', 'P', 'Q', 'T', 'U', 'W']) {
      expect(first[col(letter)]).toBe('');
    }

    // 메일 엑셀이 지점명을 잘라 보내도('대구중앙플라톤센') 한 곳만 가리키면 그곳이다.
    const second = output.rows[2]!;
    expect(second[col('C')]).toBe('대구중앙플라톤센');
    expect(second[col('G')]).toBe('03908');
    expect(second[col('H')]).toBe('서울특별시 마포구 월드컵북로 361');
    expect(second[col('S')]).toBe(808);
    expect(second[col('R')]).toBe(2424);
    expect(serialOf(second[col('V')])).toBe(excelSerialFromDate(new Date(2026, 8, 14)));

    // 표에 없는 배송지 · 상품은 칸을 비우고 이름을 말한다 — 엑셀에서 #N/A 로 보이던 것이다.
    const third = output.rows[3]!;
    expect(third[col('C')]).toBe('없는지점');
    expect(third[col('K')]).toBe('없는상품');
    expect(third[col('M')]).toBe(2);
    expect(serialOf(third[col('V')])).toBe(excelSerialFromDate(new Date(2026, 8, 14)));
    for (const letter of ['D', 'F', 'G', 'H', 'R', 'S']) expect(third[col(letter)]).toBe('');
    expect(result.notes).toEqual([
      '주소록에 없는 배송지 1곳 — 전화 · 우편번호 · 주소를 비워 두었습니다: 없는지점',
      '단가에 없는 상품 1개 — 공급단가 · 공급합계를 비워 두었습니다: 없는상품',
    ]);
  });

  it('표에 다 있으면 남기는 말이 없다', () => {
    const template = service.parseOnePolarisSellpiaTemplateFile(upload('양식.xls', templateXls()));
    const result = service.convertOnePolarisOrderFile(
      upload('주문.xlsx', orderXlsx([
        ['', '', new Date(2026, 8, 15), '2000포켓몬왕종합장_[G]', 30, '교육사업본부', '광주서북지국', 42000, '광주서북지국'],
      ])),
      template,
    );
    expect(result.notes).toEqual([]);
    const row = readOutput(result.buffer).rows[1]!;
    expect(row[col('R')]).toBe(34200);
    expect(row[col('D')]).toBe('062-514-3810');
  });

  it('주문 줄이 없는 엑셀은 NO_NEW_ORDERS 다 — 실패한 몰이 아니다', () => {
    const template = service.parseOnePolarisSellpiaTemplateFile(upload('양식.xls', templateXls()));
    try {
      service.convertOnePolarisOrderFile(upload('빈주문.xlsx', orderXlsx([])), template);
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({ code: 'NO_NEW_ORDERS' });
    }
  });

  it('제품명 · 수량 · 배송지 머리행이 없는 엑셀은 무엇이 없는지 말하며 거절한다', () => {
    const template = service.parseOnePolarisSellpiaTemplateFile(upload('양식.xls', templateXls()));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['상품', '개수', '주소'], ['a', 1, 'b']]), 'x');
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
    expect(() => service.convertOnePolarisOrderFile(upload('다른.xlsx', buffer), template))
      .toThrow(/제품명 · 수량 · 배송지/);
  });
});

describe('원폴라리스 양식 규칙', () => {
  const template: OnePolarisSellpiaTemplate = {
    fileName: '양식.xls',
    uploadedAt: '2026-09-22T10:00:00.000Z',
    addresses: [
      { site: '순천여수지점', zip: '57968', address: '순천', phone: '061' },
      { site: '순천여수지국', zip: '57968', address: '순천 플라톤', phone: '061-2' },
      { site: '대구중앙플라톤센터', zip: '41963', address: '대구', phone: '053' },
    ],
    prices: [
      { name: '3000 3in1롤리팝야광봉', cost: 1260 },
      { name: '3000 3in1롤리팝야광봉', cost: 1567.5 },
    ],
  };

  it('제품명 꼬리 `_[G]` 만 뗀다', () => {
    expect(stripOnePolarisProductTag('2000포켓몬왕종합장_[G]')).toBe('2000포켓몬왕종합장');
    expect(stripOnePolarisProductTag('카카오 데일리커팅매트L / 100*305_[G] ')).toBe('카카오 데일리커팅매트L / 100*305');
    expect(stripOnePolarisProductTag('36개국세계지도만국기')).toBe('36개국세계지도만국기');
  });

  it('배송지는 같은 이름의 첫 줄, 잘린 이름은 한 곳만 가리킬 때만 찾는다', () => {
    expect(findOnePolarisAddress(template.addresses, '순천여수지점')?.phone).toBe('061');
    expect(findOnePolarisAddress(template.addresses, ' 대구중앙플라톤센 ')?.zip).toBe('41963');
    // '순천여수지' 는 지점 · 지국 두 곳을 가리켜 고를 수 없다.
    expect(findOnePolarisAddress(template.addresses, '순천여수지')).toBeNull();
    expect(findOnePolarisAddress(template.addresses, '')).toBeNull();
  });

  it('상품은 대소문자를 가리지 않는 첫 줄이고, 띄어쓰기만 다르면 그것도 찾는다', () => {
    expect(findOnePolarisPrice(template.prices, '3000 3IN1롤리팝야광봉')?.cost).toBe(1260);
    expect(findOnePolarisPrice(template.prices, '30003in1롤리팝야광봉')?.cost).toBe(1260);
    expect(findOnePolarisPrice(template.prices, '없음')).toBeNull();
  });

  it('저장된 값이 표 모양이 아니면 양식이 없는 것이다', () => {
    expect(isOnePolarisSellpiaTemplate(null)).toBe(false);
    expect(isOnePolarisSellpiaTemplate({ fileName: 'x' })).toBe(false);
    expect(isOnePolarisSellpiaTemplate({ ...template, prices: [{ name: '메달', cost: '808' }] })).toBe(false);
    expect(isOnePolarisSellpiaTemplate(template)).toBe(true);
  });
});
