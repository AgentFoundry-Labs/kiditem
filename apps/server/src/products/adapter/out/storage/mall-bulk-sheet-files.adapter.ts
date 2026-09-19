import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import * as XLSX from 'xlsx';
import {
  headerIndex,
  missingColumns,
  normalizeColumn,
  type MallSheetRow,
  type MallSheetTemplate,
} from '../../../domain/mall-bulk-sheet/mall-bulk-sheet';
import type { MallCategoryTables } from '../../../domain/mall-bulk-sheet/mall-sheet-categories';
import type { MallBulkSheetFilesPort } from '../../../application/port/out/storage/mall-bulk-sheet-files.port';

/** 양식 · 카테고리표 폴더. 빌드 때 nest-cli assets 로 dist 에 같이 복사된다. */
const TEMPLATE_DIR = join(__dirname, 'mall-bulk-templates');

interface EsmCategoryFile {
  gmarket: Record<string, string>;
  auction: Record<string, string>;
  esmBySite: Record<string, string>;
}

/**
 * 몰 대량등록 엑셀 양식 파일(몰 판매자센터에서 받은 빈 양식)을 채운다.
 *
 * 양식의 머리행 · 안내행 · 매크로 · 숨은 시트는 그대로 두고, 상품 행 자리만 비운 뒤 채운다. 글자는 글자 칸으로
 * 쓴다 — ESM 카테고리 번호처럼 0으로 시작하는 번호가 숫자로 바뀌면 몰이 다른 카테고리로 읽는다.
 */
@Injectable()
export class MallBulkSheetFilesAdapter implements MallBulkSheetFilesPort {
  private tables: Promise<MallCategoryTables> | null = null;

  categoryTables(): Promise<MallCategoryTables> {
    this.tables ??= this.loadTables().catch((error: unknown) => {
      this.tables = null;
      throw error;
    });
    return this.tables;
  }

  async write(template: MallSheetTemplate, rows: readonly MallSheetRow[]): Promise<Buffer> {
    const source = await readFile(join(TEMPLATE_DIR, template.file));
    const macro = template.bookType === 'xlsm';
    const workbook = XLSX.read(source, { type: 'buffer', bookVBA: macro, cellStyles: true });
    const sheet = workbook.Sheets[template.sheet];
    if (!sheet?.['!ref']) throw new Error(`몰 양식에 '${template.sheet}' 시트가 없습니다: ${template.file}`);

    const range = XLSX.utils.decode_range(sheet['!ref']);
    const headers: unknown[] = [];
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      headers[column] = sheet[XLSX.utils.encode_cell({ r: template.headerRow - 1, c: column })]?.v;
    }
    const index = headerIndex(headers);
    const missing = missingColumns(index, rows);
    if (missing.length) {
      throw new Error(`몰 양식(${template.file})에 없는 칸: ${missing.join(', ')}. 몰이 양식을 바꿨는지 확인하세요.`);
    }

    const firstRow = template.firstDataRow - 1;
    const keep = new Set((template.keepColumnLetters ?? []).map((letter) => XLSX.utils.decode_col(letter)));
    for (let row = firstRow; row <= range.e.r; row += 1) {
      for (let column = range.s.c; column <= range.e.c; column += 1) {
        if (!keep.has(column)) delete sheet[XLSX.utils.encode_cell({ r: row, c: column })];
      }
    }
    // 비운 안내 · 예시 행에 걸친 병합은 새 상품 행을 덮으므로 뗀다.
    if (sheet['!merges']) sheet['!merges'] = sheet['!merges'].filter((merge) => merge.e.r < firstRow);

    rows.forEach((row, offset) => {
      for (const [column, value] of Object.entries(row)) {
        if (value === null || value === '') continue;
        const address = XLSX.utils.encode_cell({ r: firstRow + offset, c: index.get(normalizeColumn(column))! });
        sheet[address] = typeof value === 'number' ? { t: 'n', v: value } : { t: 's', v: value };
      }
    });
    // 비운 행이 범위에 남으면 몰이 빈 상품 행으로 읽는다. 실제로 값이 있는 마지막 행까지만.
    let lastRow = template.headerRow - 1;
    for (const address of Object.keys(sheet)) {
      if (!address.startsWith('!')) lastRow = Math.max(lastRow, XLSX.utils.decode_cell(address).r);
    }
    sheet['!ref'] = XLSX.utils.encode_range({ s: range.s, e: { r: lastRow, c: range.e.c } });

    return XLSX.write(workbook, { type: 'buffer', bookType: template.bookType, bookVBA: macro }) as Buffer;
  }

  private async loadTables(): Promise<MallCategoryTables> {
    const [esmRaw, coupangRaw, elevenstRaw] = await Promise.all([
      readFile(join(TEMPLATE_DIR, 'esm-categories.json.gz')),
      readFile(join(TEMPLATE_DIR, 'coupang-categories.json.gz')),
      readFile(join(TEMPLATE_DIR, '11st-categories.json'), 'utf8'),
    ]);
    const esm = JSON.parse(gunzipSync(esmRaw).toString('utf8')) as EsmCategoryFile;
    const coupang = JSON.parse(gunzipSync(coupangRaw).toString('utf8')) as { categories: Record<string, string[]> };
    const elevenst = JSON.parse(elevenstRaw) as { categories: Record<string, string> };
    return {
      paths: { gmarket: esm.gmarket, auction: esm.auction, '11st': elevenst.categories },
      esmBySite: esm.esmBySite,
      coupang: coupang.categories,
    };
  }
}
