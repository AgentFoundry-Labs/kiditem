import { ValidationPipe, type Paramtype } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  ProfitLossExportQueryDto,
  ProfitLossQueryDto,
  ReportExportQueryDto,
} from '../dto';
import { SalesAnalysisQueryDto } from '../dto/sales-analysis-query.dto';
import { CreateSalesPlanDto, UpdateSalesPlanDto } from '../sales-plans/dto';
import { CreateSettlementDto } from '../settlements/dto';

/** The global pipe: whitelist and transform. */
const pipe = new ValidationPipe({ whitelist: true, transform: true });

function transform(metatype: new () => object, type: Paramtype, value: object) {
  return pipe.transform(value, { type, metatype });
}

const MALFORMED_PERIODS = ['foo', '2026-4', '26-04', '2026-13', '2026-00', '2026-04-01'];

describe('finance month period inputs', () => {
  it.each(MALFORMED_PERIODS)('rejects sales analysis period %s with 400', async (period) => {
    await expect(transform(SalesAnalysisQueryDto, 'query', { period }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('accepts a YYYY-MM sales analysis period, or none for the current KST month', async () => {
    await expect(transform(SalesAnalysisQueryDto, 'query', { period: '2026-04' }))
      .resolves.toMatchObject({ period: '2026-04' });
    await expect(transform(SalesAnalysisQueryDto, 'query', {})).resolves.toEqual({});
  });

});

/** KID-85 follow-up F-2 — `2026-00` used to evaluate December 2025 under a `2026-00` label. */
describe.each([
  ['profit-loss', ProfitLossQueryDto, {}],
  ['profit-loss export', ProfitLossExportQueryDto, {}],
  ['report export', ReportExportQueryDto, { type: 'profitloss' }],
] as const)('%s period', (_name, metatype, base) => {
  it.each(MALFORMED_PERIODS)('rejects %s with 400', async (period) => {
    await expect(transform(metatype, 'query', { ...base, period }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('accepts a real YYYY-MM month', async () => {
    await expect(transform(metatype, 'query', { ...base, period: '2026-12' }))
      .resolves.toMatchObject({ period: '2026-12' });
  });
});

/**
 * A stored plan or settlement for `2026-13` names no month, so its live actuals
 * could never be read: the body DTOs accept a real month only.
 */
describe.each([
  ['sales plan create', CreateSalesPlanDto, {}],
  ['sales plan update', UpdateSalesPlanDto, {}],
  ['settlement create', CreateSettlementDto, { expectedAmount: 1_000 }],
] as const)('%s period', (_name, metatype, base) => {
  it.each(MALFORMED_PERIODS)('rejects %s with 400', async (period) => {
    await expect(transform(metatype, 'body', { ...base, period }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('accepts a real YYYY-MM month', async () => {
    await expect(transform(metatype, 'body', { ...base, period: '2026-12' }))
      .resolves.toMatchObject({ period: '2026-12' });
  });
});
