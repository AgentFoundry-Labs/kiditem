import { describe, expect, it, vi } from 'vitest';
import { StockoutCheckService } from './stockout-check.service';
import { ChannelAdapterRegistryAdapter } from '../../../adapter/out/channel/channel-adapter-registry.adapter';
import { CoupangChannelAdapter } from '../../../adapter/out/channel/coupang/coupang-channel.adapter';
import type { StockoutSubject } from '../../port/out/persistence/stockout-check.persistence.port';

const option = (id: string, capacity: number | null = 0) => ({ id, externalOptionId: id, status: 'active', registrationType: 'NORMAL', capacity, safetyStock: 0, compositionUnconfirmed: false });
const subject = (patch: Partial<StockoutSubject> = {}): StockoutSubject => ({ listingId: 'listing', channelAccountId: 'account', externalListingId: 'external', channel: 'coupang', status: 'active', salesProduct: null, activeExecutions: [], options: [option('a')], ...patch });
const adapters = new ChannelAdapterRegistryAdapter(new CoupangChannelAdapter({ preflightExternalProductRegistration: vi.fn() }, { isBlocked: () => true, upload: vi.fn() }));
const preview = (row: StockoutSubject) => new StockoutCheckService({ readSubjects: vi.fn(async () => [row]) }, adapters).preview('org', ['listing']);

// 송신은 `channels.registration` 의 sold_out 묶음 실행이다(KID-364). 여기서는 미리보기 판정만 본다.
describe('inventory stockout preview', () => {
  it('selects only known low-capacity actual normal options without stopping healthy/unknown siblings', async () => {
    const row = subject({ options: [option('low', 2), option('healthy', 3), option('unknown', null), { ...option('uncertain'), compositionUnconfirmed: true }, { ...option('rfm'), registrationType: 'RFM' }] });
    row.options[0]!.safetyStock = 2;
    expect(await preview(row)).toMatchObject([{ decision: 'eligible', optionCodes: ['low'] }]);
  });
  it.each([null, undefined])('does not equate missing stock/composition with zero (%s)', async capacity => {
    const row = subject({ options: [option('a', capacity === null ? null : 0)] });
    if (capacity === undefined) row.options[0]!.compositionUnconfirmed = true;
    expect(await preview(row)).toMatchObject([{ decision: 'unknown', optionCodes: [] }]);
  });
  it.each([['healthy', 1, 'in_stock'], ['unknown', null, 'unknown']] as const)('holds a whole listing with a %s sibling', async (_name, capacity, decision) => {
    expect(await preview(subject({ channel: 'kidkids', options: [option('a'), option('b', capacity)] }))).toMatchObject([{ decision }]);
  });
  it('selects all active options only when the whole listing is known out', async () => {
    expect(await preview(subject({ channel: 'kidkids', options: [option('b'), option('a')] }))).toMatchObject([{ decision: 'eligible', optionCodes: ['a', 'b'] }]);
  });
  it.each([
    { channel: 'rocket', decision: 'unsupported' },
    { status: 'sold_out', decision: 'already_sold_out' },
    { activeExecutions: [{ id: 'other' }], decision: 'active_execution' },
  ])('does not offer $decision subjects', async ({ decision, ...patch }) => {
    expect(await preview(subject(patch))).toMatchObject([{ decision }]);
  });
  /** 품절 송신도 등록 동결 · 몰 엑셀과 같은 게이트를 지난다(KID-310). */
  it('판매가를 정하지 않은 초안에서 나온 몰 상품은 보내지 않는다', async () => {
    expect(await preview(subject({
      salesProduct: { name: '초안 상품', status: 'draft', options: [{ id: 'o', supplyStatus: 'selling', salePrice: null }] },
    }))).toMatchObject([{ decision: 'draft' }]);
  });
  it('값이 확정된 판매상품에서 나온 몰 상품은 그대로 본다', async () => {
    expect(await preview(subject({
      salesProduct: { name: '판매 상품', status: 'active', options: [{ id: 'o', supplyStatus: 'selling', salePrice: 12900 }] },
    }))).toMatchObject([{ decision: 'eligible' }]);
  });
});
