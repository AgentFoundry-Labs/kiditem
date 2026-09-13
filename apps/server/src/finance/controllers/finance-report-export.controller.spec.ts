import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { FinanceReportExportController } from './finance-report-export.controller';

const ORG = '00000000-0000-4000-8000-000000000001';

function route(method: string) {
  const target = FinanceReportExportController.prototype[method as keyof FinanceReportExportController];
  return [Reflect.getMetadata('path', target), Reflect.getMetadata('method', target)];
}

describe('FinanceReportExportController', () => {
  it('exposes only the three fixed server conversion routes', () => {
    expect(Reflect.getMetadata('path', FinanceReportExportController)).toBe('/');
    expect(route('exportReport')).toEqual(['reports/export', RequestMethod.GET]);
    expect(route('exportProfitLoss')).toEqual(['profit-loss/export', RequestMethod.GET]);
    expect(route('exportSettlementReconcile')).toEqual([
      'settlements/reconcile/export',
      RequestMethod.GET,
    ]);
  });

  it('passes session organization and validated query to the owner service', async () => {
    const exporter = {
      exportReport: vi.fn().mockResolvedValue({
        buffer: Buffer.from('xlsx'),
        fileName: 'reports.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      exportProfitLoss: vi.fn().mockResolvedValue({
        buffer: Buffer.from('xlsx'),
        fileName: 'pl.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      exportSettlementReconcile: vi.fn().mockResolvedValue({
        buffer: Buffer.from('xlsx'),
        fileName: 'settlement.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    };
    const response = { setHeader: vi.fn() };
    const controller = new FinanceReportExportController(exporter);

    await controller.exportReport(ORG, {
      type: 'profitloss',
      period: '2026-08',
      surface: 'reports',
    }, response as never);
    await controller.exportProfitLoss(ORG, {
      period: '2026-08',
      profitFilter: 'minus',
      grades: 'A',
    }, response as never);
    await controller.exportSettlementReconcile(ORG, { period: '2026-08' }, response as never);

    expect(exporter.exportReport).toHaveBeenCalledWith(ORG, {
      type: 'profitloss',
      period: '2026-08',
      surface: 'reports',
    }, expect.any(Date));
    expect(exporter.exportProfitLoss).toHaveBeenCalledWith(ORG, expect.objectContaining({
      period: '2026-08',
      profitFilter: 'minus',
      grades: 'A',
    }), expect.any(Date));
    expect(exporter.exportSettlementReconcile).toHaveBeenCalledWith(ORG, '2026-08', expect.any(Date));
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  });
});
