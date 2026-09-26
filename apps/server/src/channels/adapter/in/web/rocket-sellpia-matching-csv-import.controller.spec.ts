import { describe, expect, it, vi } from 'vitest';
import { RocketSellpiaMatchingCsvImportController } from './rocket-sellpia-matching-csv-import.controller';

describe('RocketSellpiaMatchingCsvImportController', () => {
  it('passes the uploaded CSV bytes and scopes it to the authenticated organization', () => {
    const importer = { importMatchingCsv: vi.fn() };
    const controller = new RocketSellpiaMatchingCsvImportController(importer as never);
    const buffer = Buffer.from([
      '번호,쿠팡공급사_상품명,바코드,skuId,vendorItemId,셀피아상품,셀피아바코드,매칭방식,신뢰도,셀피아저장매칭,KidItem동기화,매칭상태,근거',
      '1,돌고래게틀링비눗방울총,8806384883947,17616314,78399258325,6000돌고래게틀링비눗방울총,8806384885163,이름매칭,high,N,N,이름매칭(高),제품명 일치',
    ].join('\n'));

    controller.importCsv(
      '00000000-0000-4000-8000-000000000012',
      '00000000-0000-4000-8000-000000000010',
      { id: '00000000-0000-4000-8000-000000000011' } as never,
      { buffer, originalname: 'rocket443-sellpia-matching.csv' },
    );

    expect(importer.importMatchingCsv).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: '00000000-0000-4000-8000-000000000010',
      userId: '00000000-0000-4000-8000-000000000011',
      channelAccountId: '00000000-0000-4000-8000-000000000012',
      fileName: 'rocket443-sellpia-matching.csv',
      bytes: buffer,
    }));
  });

  it('rejects a missing file with VALIDATION_FAILED before any operation starts', () => {
    const importer = { importMatchingCsv: vi.fn() };
    const controller = new RocketSellpiaMatchingCsvImportController(importer as never);
    expect(() => controller.importCsv(
      '00000000-0000-4000-8000-000000000012',
      '00000000-0000-4000-8000-000000000010',
      { id: '00000000-0000-4000-8000-000000000011' } as never,
      undefined,
    )).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
    expect(importer.importMatchingCsv).not.toHaveBeenCalled();
  });
});
