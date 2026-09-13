import { ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { UpdateSettlementDto } from '../dto';

/** The global pipe: whitelist and transform. */
const pipe = new ValidationPipe({ whitelist: true, transform: true });

function transform(value: object) {
  return pipe.transform(value, { type: 'body', metatype: UpdateSettlementDto });
}

/** KID-85 follow-up F-3 — a null amount used to reach the non-null column and answer 500. */
describe('UpdateSettlementDto actualAmount', () => {
  it('rejects a null deposit amount with 400', async () => {
    await expect(transform({ status: 'confirmed', actualAmount: null }))
      .rejects.toMatchObject({ status: 400 });
    await expect(transform({ actualAmount: null }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('accepts an entered amount, including a recorded zero, or no amount at all', async () => {
    await expect(transform({ status: 'confirmed', actualAmount: 0 }))
      .resolves.toMatchObject({ status: 'confirmed', actualAmount: 0 });
    await expect(transform({ status: 'confirmed', actualAmount: '980000' }))
      .resolves.toMatchObject({ actualAmount: 980_000 });
    await expect(transform({ notes: '확인' })).resolves.toEqual({ notes: '확인' });
  });
});
