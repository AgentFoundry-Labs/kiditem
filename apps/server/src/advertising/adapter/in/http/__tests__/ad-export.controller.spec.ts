import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AdExportController } from '../ad-export.controller';

const result = {
  buffer: Buffer.from('server-workbook'),
  fileName: '광고캠페인_A등급_20260731.xlsx',
  contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' as const,
};

describe('AdExportController', () => {
  it('exposes authenticated transient campaign and trend POST routes', () => {
    expect(Reflect.getMetadata('path', AdExportController)).toBe('ads/exports');
    expect(route('exportCampaign')).toEqual(['campaign', RequestMethod.POST]);
    expect(route('exportTrend')).toEqual(['trend', RequestMethod.POST]);
  });

  it('returns the server-generated workbook with no-store download headers', () => {
    const exporter = {
      exportCampaign: vi.fn().mockReturnValue(result),
      exportTrend: vi.fn().mockReturnValue(result),
    };
    const response = { setHeader: vi.fn() };
    const controller = new AdExportController(exporter as never);
    const body = { grade: 'A', actions: [], budget: 100_000 };

    const file = controller.exportCampaign(body as never, 'organization-from-session', response as never);

    expect(exporter.exportCampaign).toHaveBeenCalledWith(body);
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      result.contentType,
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="______A___20260731.xlsx"; filename*=UTF-8\'\'%EA%B4%91%EA%B3%A0%EC%BA%A0%ED%8E%98%EC%9D%B8_A%EB%93%B1%EA%B8%89_20260731.xlsx',
    );
    expect(file).toBeDefined();
  });
});

function route(method: 'exportCampaign' | 'exportTrend') {
  const target = AdExportController.prototype[method];
  return [Reflect.getMetadata('path', target), Reflect.getMetadata('method', target)];
}
