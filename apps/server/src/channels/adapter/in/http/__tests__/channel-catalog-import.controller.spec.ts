import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { BadRequestException, RequestMethod } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import type { ChannelCatalogImportPort } from '../../../../application/port/in/channel-catalog-import.port';
import { ChannelCatalogImportController } from '../channel-catalog-import.controller';

const HEADERS = [
  '등록상품ID',
  '등록상품명',
  '쿠팡 노출상품명',
  '카테고리',
  '제조사',
  '브랜드',
  '승인상태',
  '옵션 ID',
  '등록 옵션명',
  '판매상태',
  '모델번호',
  '바코드',
];

describe('ChannelCatalogImportController', () => {
  it('exposes exactly the account-scoped Coupang Wing POST route', () => {
    expect(Reflect.getMetadata('path', ChannelCatalogImportController)).toBe(
      'channels/accounts/:channelAccountId/catalog-imports/coupang-wing',
    );
    const methods = Object.getOwnPropertyNames(ChannelCatalogImportController.prototype)
      .filter((name) => name !== 'constructor');
    expect(methods).toEqual(['importWorkbook']);
    expect(Reflect.getMetadata(
      'path',
      ChannelCatalogImportController.prototype.importWorkbook,
    )).toBe('/');
    expect(Reflect.getMetadata(
      'method',
      ChannelCatalogImportController.prototype.importWorkbook,
    )).toBe(RequestMethod.POST);
  });

  it('uses ParseUUIDPipe for the account and accepts no organization body/query input', () => {
    const source = readFileSync(__filename.replace(/__tests__\/[^/]+$/, 'channel-catalog-import.controller.ts'), 'utf8');
    expect(source).toContain("@Param('channelAccountId', new ParseUUIDPipe())");
    expect(source).not.toContain('@Body(');
    expect(source).not.toContain('@Query(');
  });

  it('rejects a missing workbook with HTTP 400', () => {
    const controller = new ChannelCatalogImportController(makePort());

    expect(() => controller.importWorkbook(
      '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000001',
      { id: '00000000-0000-4000-8000-000000000002' } as never,
      undefined,
    )).toThrow(BadRequestException);
  });

  it('parses original bytes and passes the account, current tenant/user, and lowercase SHA-256', async () => {
    const port = makePort();
    const controller = new ChannelCatalogImportController(port);
    const buffer = workbookBuffer();
    const channelAccountId = '00000000-0000-4000-8000-000000000003';
    const organizationId = '00000000-0000-4000-8000-000000000001';
    const userId = '00000000-0000-4000-8000-000000000002';

    await controller.importWorkbook(
      channelAccountId,
      organizationId,
      { id: userId } as never,
      { buffer, originalname: 'Coupang_detailinfo.xlsx' },
    );

    expect(port.importCoupangWing).toHaveBeenCalledWith({
      organizationId,
      userId,
      channelAccountId,
      fileName: 'Coupang_detailinfo.xlsx',
      fileHash: createHash('sha256').update(buffer).digest('hex'),
      headers: HEADERS,
      rows: [expect.objectContaining({
        rowNumber: 5,
        externalProductId: 'P-001',
        externalSkuId: 'S-001',
      })],
      skippedRows: [],
    });
    const passed = port.importCoupangWing.mock.calls[0]?.[0];
    expect(passed).not.toHaveProperty('organizationIdFromBody');
    expect(passed?.fileHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('caps the file interceptor at 20 MiB on field file', () => {
    const source = readFileSync(__filename.replace(/__tests__\/[^/]+$/, 'channel-catalog-import.controller.ts'), 'utf8');
    expect(source).toContain(
      "FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } })",
    );
  });
});

function makePort() {
  return {
    importCoupangWing: vi
      .fn<ChannelCatalogImportPort['importCoupangWing']>()
      .mockResolvedValue({} as never),
  };
}

function workbookBuffer(): Buffer {
  const workbook = XLSX.utils.book_new();
  const row = HEADERS.map((header) => {
    if (header === '등록상품ID') return 'P-001';
    if (header === '옵션 ID') return 'S-001';
    return '';
  });
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['title'], [], [], HEADERS, row,
  ]), 'Template');
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
}
