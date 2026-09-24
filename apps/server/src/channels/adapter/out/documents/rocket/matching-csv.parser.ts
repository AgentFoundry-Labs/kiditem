import { BadRequestException } from '@nestjs/common';

import type { ParsedRocketSellpiaMatchingCsvRow, ParsedRocketSellpiaMatchingCsv } from '../../../../application/port/out/documents/channel-document.models';
export type { ParsedRocketSellpiaMatchingCsvRow, ParsedRocketSellpiaMatchingCsv } from '../../../../application/port/out/documents/channel-document.models';

const REQUIRED_HEADERS = [
  '쿠팡공급사_상품명',
  '바코드',
  'skuId',
  'vendorItemId',
  '셀피아상품',
  '셀피아바코드',
  '매칭방식',
  '신뢰도',
  '셀피아저장매칭',
  'KidItem동기화',
  '매칭상태',
  '근거',
] as const;

export function parseRocketSellpiaMatchingCsv(
  buffer: Buffer,
): ParsedRocketSellpiaMatchingCsv {
  const records = parseCsvRecords(buffer.toString('utf8'));
  const headerRecord = records.shift();
  if (!headerRecord) {
    throw new BadRequestException('로켓-셀피아 매칭 CSV가 비어 있습니다.');
  }
  const headers = headerRecord.values.map((value) => value.replace(/^\uFEFF/u, '').trim());
  const missing = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length > 0) {
    throw new BadRequestException(
      `로켓-셀피아 매칭 CSV 필수 컬럼을 찾을 수 없습니다: ${missing.join(', ')}`,
    );
  }
  const externalSkuIds = new Set<string>();
  const rows = records.flatMap((record) => {
    const rawJson = Object.fromEntries(headers.map((header, index) => [
      header,
      (record.values[index] ?? '').trim(),
    ]));
    if (Object.values(rawJson).every((value) => value.length === 0)) return [];
    const externalSkuId = requiredText(rawJson.skuId, record.rowNumber, 'skuId');
    if (externalSkuIds.has(externalSkuId)) {
      throw new BadRequestException(
        `로켓-셀피아 매칭 CSV에 중복된 skuId가 있습니다: ${externalSkuId}`,
      );
    }
    externalSkuIds.add(externalSkuId);
    return [{
      rowNumber: record.rowNumber,
      externalSkuId,
      vendorItemId: optionalText(rawJson.vendorItemId),
      productName: requiredText(rawJson.쿠팡공급사_상품명, record.rowNumber, '쿠팡공급사_상품명'),
      supplierStatus: optionalText(rawJson.쿠팡공급상태),
      channelBarcode: optionalText(rawJson.바코드),
      sellpiaProductName: optionalText(rawJson.셀피아상품),
      sellpiaBarcode: optionalText(rawJson.셀피아바코드),
      matchMethod: optionalText(rawJson.매칭방식),
      confidence: optionalText(rawJson.신뢰도),
      sellpiaStoredMatch: isYes(rawJson.셀피아저장매칭),
      kiditemSynchronized: isYes(rawJson.KidItem동기화),
      matchStatus: optionalText(rawJson.매칭상태),
      evidence: optionalText(rawJson.근거),
      rawJson,
    }];
  });
  if (rows.length === 0) {
    throw new BadRequestException('로켓-셀피아 매칭 CSV에 가져올 상품이 없습니다.');
  }
  return { headers, rows };
}

function requiredText(value: string | undefined, rowNumber: number, field: string): string {
  const normalized = optionalText(value);
  if (normalized) return normalized;
  throw new BadRequestException(
    `로켓-셀피아 매칭 CSV ${rowNumber}행의 ${field} 값이 비어 있습니다.`,
  );
}

function optionalText(value: string | undefined): string | null {
  const normalized = value?.trim() ?? '';
  return normalized || null;
}

function isYes(value: string | undefined): boolean {
  return optionalText(value)?.toLocaleUpperCase() === 'Y';
}

function parseCsvRecords(value: string): Array<{ rowNumber: number; values: string[] }> {
  const records: Array<{ rowNumber: number; values: string[] }> = [];
  let rowNumber = 1;
  let field = '';
  let values: string[] = [];
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]!;
    if (char === '"') {
      if (quoted && value[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === ',' && !quoted) {
      values.push(field);
      field = '';
      continue;
    }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && value[index + 1] === '\n') index += 1;
      values.push(field);
      if (values.some((entry) => entry.length > 0)) records.push({ rowNumber, values });
      values = [];
      field = '';
      rowNumber += 1;
      continue;
    }
    field += char;
  }
  if (quoted) throw new BadRequestException('로켓-셀피아 매칭 CSV의 따옴표 형식이 올바르지 않습니다.');
  if (field.length > 0 || values.length > 0) {
    values.push(field);
    if (values.some((entry) => entry.length > 0)) records.push({ rowNumber, values });
  }
  return records;
}
