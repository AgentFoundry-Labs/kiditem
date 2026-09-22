import { describe, expect, it, vi } from 'vitest';
import { StockoutCheckService } from './stockout-check.service';
import type { StockoutSubject } from '../../port/out/persistence/stockout-check.persistence.port';
import type { ListingAvailabilityExecution, ListingAvailabilitySnapshot } from '@kiditem/shared/sales-product';
import type { OwnerTransaction } from '../../../../common/owner-transaction';

const POLICY = 'capacity_at_or_below_safety_stock' as const;
const option = (id: string, capacity: number | null = 0) => ({ id, externalOptionId: id, status: 'active', registrationType: 'NORMAL', capacity, safetyStock: 0, compositionUnconfirmed: false });
const subject = (patch: Partial<StockoutSubject> = {}): StockoutSubject => ({ listingId: 'listing', channelAccountId: 'account', externalListingId: 'external', channel: 'coupang', status: 'active', salesProduct: null, activeExecutions: [], options: [option('a')], ...patch });
function fixture(row: StockoutSubject) {
  const readSubjects = vi.fn(async () => [row]);
  const prepareListingAvailability = vi.fn(async () => ({}) as ListingAvailabilityExecution);
  const findListingAvailabilityByKey = vi.fn(async (): Promise<ListingAvailabilityExecution | null> => null);
  return { service: new StockoutCheckService({ readSubjects }, { prepareListingAvailability, findListingAvailabilityByKey }), readSubjects, prepareListingAvailability, findListingAvailabilityByKey };
}
function snapshot(row: StockoutSubject, codes = row.options.map(option => option.externalOptionId)): ListingAvailabilitySnapshot {
  return { subject: 'channel_listing', channelListingId: row.listingId, channelAccountId: row.channelAccountId, mallKey: row.channel, externalListingId: row.externalListingId, kind: 'sold_out', stockoutPolicy: POLICY, optionCodes: codes };
}
describe('explicit inventory stockout', () => {
  it('selects only known low-capacity actual normal options without stopping healthy/unknown siblings', async () => {
    const row = subject({ options: [option('low', 2), option('healthy', 3), option('unknown', null), { ...option('uncertain'), compositionUnconfirmed: true }, { ...option('rfm'), registrationType: 'RFM' }] });
    row.options[0]!.safetyStock = 2;
    const f = fixture(row);
    expect(await f.service.preview('org', ['listing'])).toMatchObject([{ decision: 'eligible', optionCodes: ['low'] }]);
    await f.service.prepare('org', 'actor', { listingId: 'listing', idempotencyKey: 'key' });
    expect(f.prepareListingAvailability).toHaveBeenCalledWith(expect.objectContaining({ request: expect.objectContaining({ kind: 'sold_out', stockoutPolicy: POLICY, optionCodes: ['low'] }) }));
  });
  it.each([null, undefined])('does not equate missing stock/composition with zero (%s)', async capacity => {
    const row = subject({ options: [option('a', capacity === null ? null : 0)] });
    if (capacity === undefined) row.options[0]!.compositionUnconfirmed = true;
    const f = fixture(row);
    await expect(f.service.prepare('org', null, { listingId: 'listing', idempotencyKey: 'key' })).rejects.toThrow('unknown');
    expect(f.prepareListingAvailability).not.toHaveBeenCalled();
  });
  it.each([['healthy', 1, 'in_stock'], ['unknown', null, 'unknown']] as const)('holds a whole listing with a %s sibling', async (_name, capacity, decision) => {
    expect(await fixture(subject({ channel: 'kidkids', options: [option('a'), option('b', capacity)] })).service.preview('org', ['listing'])).toMatchObject([{ decision }]);
  });
  it('freezes all active options only when the whole listing is known out', async () => {
    expect(await fixture(subject({ channel: 'kidkids', options: [option('b'), option('a')] })).service.preview('org', ['listing'])).toMatchObject([{ decision: 'eligible', optionCodes: ['a', 'b'] }]);
  });
  it.each([
    { channel: 'rocket', decision: 'unsupported' },
    { status: 'sold_out', decision: 'already_sold_out' },
    { activeExecutions: [{ id: 'other', idempotencyKey: 'other' }], decision: 'active_execution' },
  ])('does not prepare $decision subjects', async ({ decision, ...patch }) => {
    const f = fixture(subject(patch));
    await expect(f.service.prepare('org', null, { listingId: 'listing', idempotencyKey: 'key' })).rejects.toThrow(decision);
    expect(f.prepareListingAvailability).not.toHaveBeenCalled();
  });
  /**
   * 품절 송신도 등록 동결 · 몰 엑셀과 같은 게이트를 지난다(KID-310). 아직 판매가를 정하지
   * 않은 초안에서 나온 몰 상품에는 아무것도 보내지 않는다.
   */
  it('판매가를 정하지 않은 초안에서 나온 몰 상품은 보내지 않는다', async () => {
    const f = fixture(subject({
      salesProduct: { name: '초안 상품', status: 'draft', options: [{ id: 'o', supplyStatus: 'selling', salePrice: null }] },
    }));

    expect(await f.service.preview('org', ['listing'])).toMatchObject([{ decision: 'draft' }]);
    await expect(f.service.prepare('org', null, { listingId: 'listing', idempotencyKey: 'key' }))
      .rejects.toThrow('draft');
    expect(f.prepareListingAvailability).not.toHaveBeenCalled();
  });

  it('값이 확정된 판매상품에서 나온 몰 상품은 그대로 본다', async () => {
    const f = fixture(subject({
      salesProduct: { name: '판매 상품', status: 'active', options: [{ id: 'o', supplyStatus: 'selling', salePrice: 12900 }] },
    }));

    expect(await f.service.preview('org', ['listing'])).toMatchObject([{ decision: 'eligible' }]);
  });

  it('replays the historical receipt even after stock recovery without re-reading inventory', async () => {
    const row = subject(); const f = fixture(row);
    const receipt = { payload: snapshot(row), executionId: 'historic', maySubmit: false } as ListingAvailabilityExecution;
    f.findListingAvailabilityByKey.mockResolvedValue(receipt);
    expect(await f.service.prepare('org', 'actor', { listingId: 'listing', idempotencyKey: 'key' })).toBe(receipt);
    expect(f.readSubjects).not.toHaveBeenCalled();
    expect(f.prepareListingAvailability).not.toHaveBeenCalled();
    await expect(f.service.prepare('org', 'actor', { listingId: 'other', idempotencyKey: 'key' })).rejects.toThrow('another availability intent');
  });
  it('rechecks in the provided transaction, ignoring only its own execution', async () => {
    const row = subject({ activeExecutions: [{ id: 'own', idempotencyKey: 'key' }] }); const f = fixture(row);
    const tx = {} as OwnerTransaction;
    await f.service.assertEligible(tx, 'org', snapshot(row), 'own');
    expect(f.readSubjects).toHaveBeenCalledWith('org', ['listing'], tx);
    row.options[0]!.capacity = 1;
    await expect(f.service.assertEligible(tx, 'org', snapshot(row), 'own')).rejects.toThrow('in_stock');
    row.options[0]!.capacity = 0;
    await expect(f.service.assertEligible(tx, 'org', snapshot(row, ['changed']), 'own')).rejects.toThrow('targets changed');
    row.activeExecutions.push({ id: 'other', idempotencyKey: 'other' });
    await expect(f.service.assertEligible(tx, 'org', snapshot(row), 'own')).rejects.toThrow('active_execution');
  });
});
