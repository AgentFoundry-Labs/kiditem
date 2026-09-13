import { ValidationPipe, type Paramtype } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { SalesAnalysisQueryDto } from '../dto/sales-analysis-query.dto';
import { ReconcileSettlementDto } from '../settlements/dto';

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

  it.each(MALFORMED_PERIODS)('rejects reconcile period %s with 400', async (period) => {
    await expect(transform(ReconcileSettlementDto, 'body', { period }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('requires a YYYY-MM reconcile period', async () => {
    await expect(transform(ReconcileSettlementDto, 'body', { period: '2026-04' }))
      .resolves.toMatchObject({ period: '2026-04' });
    await expect(transform(ReconcileSettlementDto, 'body', {}))
      .rejects.toMatchObject({ status: 400 });
  });
});
