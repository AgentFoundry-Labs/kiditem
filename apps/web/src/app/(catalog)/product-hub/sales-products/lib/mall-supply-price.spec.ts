import { describe, expect, it } from 'vitest';
import { nextAdapterValues, SUPPLY_PRICE_MALLS } from './mall-supply-price';

describe('nextAdapterValues', () => {
  it('keeps the Sabangnet values while setting the supply price', () => {
    const override = { adapterValues: { sabangnetCategoryPath: '완구 > 비눗방울', sabangnetTemplateTitle: '기본' } };
    expect(nextAdapterValues(override, '2,200')).toEqual({
      sabangnetCategoryPath: '완구 > 비눗방울',
      sabangnetTemplateTitle: '기본',
      supplyPrice: '2200',
    });
  });

  it('drops the supply price when it is cleared or not a positive number', () => {
    const override = { adapterValues: { supplyPrice: '2200', sabangnetCategoryPath: '완구' } };
    expect(nextAdapterValues(override, '')).toEqual({ sabangnetCategoryPath: '완구' });
    expect(nextAdapterValues(override, '0')).toEqual({ sabangnetCategoryPath: '완구' });
  });

  it('returns null when nothing is left to keep', () => {
    expect(nextAdapterValues(undefined, '')).toBeNull();
    expect(nextAdapterValues({ adapterValues: { supplyPrice: '100' } }, '')).toBeNull();
  });

  it('only onchannel takes a supply price today', () => {
    expect(SUPPLY_PRICE_MALLS.has('onch')).toBe(true);
    expect(SUPPLY_PRICE_MALLS.has('smartstore')).toBe(false);
  });
});
