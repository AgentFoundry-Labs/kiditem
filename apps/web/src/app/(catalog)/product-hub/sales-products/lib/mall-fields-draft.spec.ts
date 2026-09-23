import { describe, expect, it } from 'vitest';
import { mallFieldsDraftOf, mallFieldsFromDraft } from './mall-fields-draft';

describe('mall fields draft (KID-310 e)', () => {
  it('splits the structured fields from the other mall keys', () => {
    expect(mallFieldsDraftOf({ supplyPrice: '4700', promoText: '빠른 배송', stockPercent: 80, deliveryTemplate: 'T1' })).toEqual({
      supplyPrice: '4700',
      promoText: '빠른 배송',
      stockPercent: '80',
      extra: [{ key: 'deliveryTemplate', value: 'T1' }],
    });
  });

  it('round-trips the stored values, keeping non-string values the operator did not touch', () => {
    const stored = { supplyPrice: '4700', stockPercent: 80, sabangnetTemplate: null, useGift: true, returnCode: 'R1' };
    expect(mallFieldsFromDraft(mallFieldsDraftOf(stored), stored)).toEqual({ ok: true, value: stored });
  });

  it('stores supply price as text, stock percent as a number and drops empty fields', () => {
    const result = mallFieldsFromDraft({
      supplyPrice: ' 5000 ',
      promoText: '',
      stockPercent: '90',
      extra: [{ key: ' deliveryTemplate ', value: 'T2' }, { key: '', value: '' }],
    }, {});
    expect(result).toEqual({ ok: true, value: { supplyPrice: '5000', stockPercent: 90, deliveryTemplate: 'T2' } });
  });

  it('refuses values the server would reject, with the reason', () => {
    const base = { supplyPrice: '', promoText: '', stockPercent: '', extra: [] };
    expect(mallFieldsFromDraft({ ...base, supplyPrice: '-1' }, {})).toMatchObject({ ok: false, error: expect.stringContaining('공급가') });
    expect(mallFieldsFromDraft({ ...base, stockPercent: '120' }, {})).toMatchObject({ ok: false, error: expect.stringContaining('재고 비율') });
    expect(mallFieldsFromDraft({ ...base, promoText: 'x'.repeat(20_001) }, {})).toMatchObject({ ok: false, error: expect.stringContaining('20000') });
    expect(mallFieldsFromDraft({ ...base, extra: [{ key: 'a', value: '1' }, { key: 'a', value: '2' }] }, {}))
      .toMatchObject({ ok: false, error: expect.stringContaining('a') });
    expect(mallFieldsFromDraft({ ...base, extra: [{ key: 'salePrice', value: '1' }] }, {}))
      .toMatchObject({ ok: false, error: expect.stringContaining('판매상품') });
    expect(mallFieldsFromDraft({ ...base, extra: [{ key: 'k'.repeat(121), value: '1' }] }, {}))
      .toMatchObject({ ok: false, error: expect.stringContaining('120') });
  });
});
