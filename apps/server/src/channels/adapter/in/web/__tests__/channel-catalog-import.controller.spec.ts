import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { WingCatalogOperationPort } from '../../../../application/port/in/wing-catalog-operation.port';
import { ChannelCatalogImportController } from '../channel-catalog-import.controller';

const ACCOUNT = '00000000-0000-4000-8000-000000000003';
const ORG = '00000000-0000-4000-8000-000000000001';
const USER = '00000000-0000-4000-8000-000000000002';

describe('ChannelCatalogImportController', () => {
  it('exposes exactly the account-scoped Coupang Wing POST route', () => {
    expect(Reflect.getMetadata('path', ChannelCatalogImportController)).toBe(
      'channels/accounts/:channelAccountId/catalog-imports/coupang-wing',
    );
    const methods = Object.getOwnPropertyNames(ChannelCatalogImportController.prototype)
      .filter((name) => name !== 'constructor');
    expect(methods).toEqual(['importWorkbook']);
    expect(Reflect.getMetadata('path', ChannelCatalogImportController.prototype.importWorkbook)).toBe('/');
    expect(Reflect.getMetadata('method', ChannelCatalogImportController.prototype.importWorkbook)).toBe(RequestMethod.POST);
  });

  it('uses ParseUUIDPipe for the account and accepts no organization body/query input', () => {
    const source = readFileSync(__filename.replace(/__tests__\/[^/]+$/, 'channel-catalog-import.controller.ts'), 'utf8');
    expect(source).toContain("@Param('channelAccountId', new ParseUUIDPipe())");
    // 본문에서 받는 값은 엑셀 스냅샷 기준 시각 하나뿐이다 (KID-349).
    expect(source.match(/@Body\([^)]*\)/g)).toEqual(["@Body('observedAt')"]);
    expect(source).not.toContain('@Query(');
  });

  it('rejects a missing workbook with VALIDATION_FAILED before any operation starts', () => {
    const uploadWorkbook = vi.fn();
    const controller = new ChannelCatalogImportController({ uploadWorkbook } as unknown as WingCatalogOperationPort);
    expect(() => controller.importWorkbook(ACCOUNT, ORG, { id: USER } as never, undefined))
      .toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
    expect(uploadWorkbook).not.toHaveBeenCalled();
  });

  it('hands the original bytes, the account and the session organization/user to the excel kind', async () => {
    const uploadWorkbook = vi.fn().mockResolvedValue({ operation: { id: 'op' } });
    const controller = new ChannelCatalogImportController({ uploadWorkbook } as unknown as WingCatalogOperationPort);
    const buffer = Buffer.from('workbook');
    await expect(controller.importWorkbook(ACCOUNT, ORG, { id: USER } as never, { buffer, originalname: 'wing.xlsx' }, '2026-09-24T09:00:00+09:00'))
      .resolves.toEqual({ operation: { id: 'op' } });
    expect(uploadWorkbook).toHaveBeenCalledWith({
      organizationId: ORG,
      userId: USER,
      channelAccountId: ACCOUNT,
      bytes: buffer,
      observedAt: '2026-09-24T09:00:00+09:00',
    });
  });
});
