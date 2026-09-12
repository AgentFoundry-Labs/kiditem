import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CoupangWingRegistrationExportController } from '../coupang-wing-registration-export.controller';

describe('CoupangWingRegistrationExportController', () => {
  it('exposes the authenticated transient multipart export route', () => {
    expect(Reflect.getMetadata('path', CoupangWingRegistrationExportController)).toBe(
      'channels/coupang-wing',
    );
    const method = CoupangWingRegistrationExportController.prototype.exportRegistration;
    expect(Reflect.getMetadata('path', method)).toBe('registration-export');
    expect(Reflect.getMetadata('method', method)).toBe(RequestMethod.POST);
  });

  it('parses the raw template/products request and returns server bytes', () => {
    const conversion = {
      buffer: Buffer.from('server-workbook'),
      fileName: '쿠팡WING_일괄등록_20260907.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' as const,
      productCount: 1,
      rowCount: 1,
    };
    const exporter = { convert: vi.fn().mockReturnValue(conversion) };
    const response = { setHeader: vi.fn() };
    const controller = new CoupangWingRegistrationExportController(exporter as never);
    const products = [{ productName: '상품' }];

    const file = controller.exportRegistration(
      { buffer: Buffer.from('template'), originalname: 'template.xlsm' },
      JSON.stringify(products),
      conversion.fileName,
      'organization-from-session',
      response as never,
    );

    expect(exporter.convert).toHaveBeenCalledWith(
      Buffer.from('template'),
      products,
      conversion.fileName,
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining("filename*=UTF-8''%EC%BF%A0%ED%8C%A1WING_%EC%9D%BC%EA%B4%84%EB%93%B1%EB%A1%9D_20260907.xlsx"),
    );
    expect(file).toBeDefined();
  });
});
