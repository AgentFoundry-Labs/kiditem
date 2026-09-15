import { describe, expect, it } from 'vitest';
import {
  ORDER_COLLECTION_MALLS,
  findOrderCollectionMall,
  orderCollectionMallAccountChannels,
  orderCollectionMallAccountFilter,
  orderCollectionMallAccountIdentity,
  orderCollectionMallKeyForAccount,
  pickOrderCollectionMallAccounts,
} from './order-collection-malls';

/**
 * 몰 하나 = 계정 행 하나(ADR-0012).
 *
 * 지키는 것 —
 *  1. 몰 행의 채널은 몰 키다. 예전 `order_collection` 가짜 채널은 어디에도 없다.
 *  2. 기존 마켓 판매자 시스템에 속한 몰은 그 행을 쓴다(쿠팡직배송 → rocket).
 *  3. 한 채널을 두 몰이 나눠 쓰지 않는다 — 행에서 몰을 되찾을 수 있어야 한다.
 */
describe('주문 수집 몰 계정 행', () => {
  it('⭐ 몰 행은 채널과 외부 계정 ID 가 모두 몰 키다', () => {
    expect(orderCollectionMallAccountIdentity(findOrderCollectionMall('kidkids')!)).toEqual({
      kind: 'own',
      channel: 'kidkids',
      externalAccountId: 'kidkids',
    });
  });

  it('⭐ 쿠팡직배송은 새 행을 두지 않고 rocket 행을 쓴다', () => {
    expect(orderCollectionMallAccountIdentity(findOrderCollectionMall('coupang-direct')!)).toEqual({
      kind: 'shared',
      channel: 'rocket',
    });
    expect(orderCollectionMallKeyForAccount({ channel: 'rocket' })).toBe('coupang-direct');
  });

  it('⭐ 계정 행에서 몰을 되찾고, 레지스트리 몰의 행이 아니면 null 이다', () => {
    expect(orderCollectionMallKeyForAccount({ channel: 'toss' })).toBe('toss');
    expect(orderCollectionMallKeyForAccount({ channel: 'coupang' })).toBeNull();
    expect(orderCollectionMallKeyForAccount({ channel: 'order_collection' })).toBeNull();
  });

  it('한 채널을 두 몰이 나눠 쓰지 않는다', () => {
    const channels = ORDER_COLLECTION_MALLS.map((mall) => orderCollectionMallAccountIdentity(mall).channel);
    expect(new Set(channels).size).toBe(channels.length);
  });

  it('몰 행 채널과 공유 마켓 채널을 따로 모은다', () => {
    const { own, shared } = orderCollectionMallAccountChannels();
    expect(own).toContain('art09');
    expect(own).not.toContain('coupang-direct');
    expect(shared).toEqual(['rocket']);
  });

  it('모르는 몰은 null 이다', () => {
    expect(findOrderCollectionMall('order_collection')).toBeNull();
  });

  it('⭐ 행에서 몰마다 첫 행을 고르고, 외부 계정 ID 가 몰 키가 아닌 몰 행은 그 몰의 행이 아니다', () => {
    const rows = [
      { id: 'rocket-primary', channel: 'rocket', externalAccountId: 'V001' },
      { id: 'rocket-second', channel: 'rocket', externalAccountId: 'V002' },
      { id: 'kidkids', channel: 'kidkids', externalAccountId: 'kidkids' },
      { id: 'toss-odd', channel: 'toss', externalAccountId: 'someone' },
      { id: 'coupang', channel: 'coupang', externalAccountId: 'A001' },
    ];
    const picked = pickOrderCollectionMallAccounts(rows);
    expect(picked.get('coupang-direct')?.id).toBe('rocket-primary');
    expect(picked.get('kidkids')?.id).toBe('kidkids');
    expect(picked.has('toss')).toBe(false);
    expect([...picked.keys()]).toHaveLength(2);
  });

  it('조회 조건은 몰 행이면 채널·외부 계정 ID, 공유 행이면 채널만이다', () => {
    expect(orderCollectionMallAccountFilter(findOrderCollectionMall('art09')!))
      .toEqual({ channel: 'art09', externalAccountId: 'art09' });
    expect(orderCollectionMallAccountFilter(findOrderCollectionMall('coupang-direct')!))
      .toEqual({ channel: 'rocket' });
  });
});
