import { UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { contributionMoney } from './master-product-contribution.repository.adapter';

describe('contributionMoney', () => {
  it('preserves nullable and safely representable SQL monetary aggregates', () => {
    expect(contributionMoney(null)).toBeNull();
    expect(contributionMoney(0n)).toBe(0);
    expect(contributionMoney('123456')).toBe(123_456);
  });

  it('rejects monetary aggregates that JSON cannot represent exactly', () => {
    expect(() => contributionMoney(BigInt(Number.MAX_SAFE_INTEGER) + 1n))
      .toThrowError(UnprocessableEntityException);
    expect(() => contributionMoney('0.5'))
      .toThrowError('CONTRIBUTION_AMOUNT_OUT_OF_RANGE');
  });
});
