import { ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { StatisticsQueryDto } from '../dto';

/** The global pipe: whitelist and transform. */
const pipe = new ValidationPipe({ whitelist: true, transform: true });

function transform(value: object) {
  return pipe.transform(value, { type: 'query', metatype: StatisticsQueryDto });
}

describe('StatisticsQueryDto period', () => {
  it.each(['foo', '2026-4', '26-04', '2026-13', '2026-00', '2026-04-01'])(
    'rejects period %s with 400',
    async (period) => {
      await expect(transform({ type: 'overview', period })).rejects.toMatchObject({ status: 400 });
    },
  );

  it('accepts a YYYY-MM period, or none for the observed orders', async () => {
    await expect(transform({ type: 'overview', period: '2026-04' }))
      .resolves.toMatchObject({ type: 'overview', period: '2026-04' });
    await expect(transform({ type: 'pareto' })).resolves.toEqual({ type: 'pareto' });
  });
});
