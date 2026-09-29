import { describe, expect, it } from 'vitest';
import { classifyChannelListingSaleStatus, isChannelListingSelling, resolveChannelListingSaleState } from './channel-listing.js';

describe('판매중 정본 규칙(KID-333 ②, 사장님 2026-09-29 Q1 (a))', () => {
  it('isActive + 게시 상태 + 원본 판매상태 없음 → 판매중', () => {
    expect(resolveChannelListingSaleState({ isActive: true, listingStatus: '승인완료' })).toBe('on_sale');
    expect(resolveChannelListingSaleState({ isActive: true, listingStatus: 'partial_on_sale', rawStatus: '판매중' })).toBe('on_sale');
  });
  it('쿠팡 승인완료인데 원본이 판매중지면 판매중이 아니다(로컬 735건)', () => {
    expect(resolveChannelListingSaleState({ isActive: true, listingStatus: '승인완료', rawStatus: '판매중지' })).toBe('off_sale');
  });
  it('꺼 둔 리스팅은 상태와 무관하게 판매중이 아니다', () => {
    expect(resolveChannelListingSaleState({ isActive: false, listingStatus: '판매중', rawStatus: '판매중' })).toBe('off_sale');
  });
  it('모르는 상태(단종·observed·미확인·REJECTED)는 판매중이 아니다 — 옛 규칙(isActive면 판매중)을 버린다', () => {
    expect(resolveChannelListingSaleState({ isActive: true, listingStatus: '단종' })).toBe('off_sale');
    expect(resolveChannelListingSaleState({ isActive: true, listingStatus: 'observed' })).toBe('unknown');
    expect(resolveChannelListingSaleState({ isActive: true, listingStatus: '미확인' })).toBe('unknown');
    expect(resolveChannelListingSaleState({ isActive: true, listingStatus: 'REJECTED' })).toBe('off_sale');
    expect(isChannelListingSelling({ isActive: true, listingStatus: 'observed' })).toBe(false);
  });
  it('원본이 모르는 글자면 판매중으로 단정하지 않는다(unknown)', () => {
    expect(resolveChannelListingSaleState({ isActive: true, listingStatus: 'on_sale', rawStatus: '검수중' })).toBe('unknown');
  });
  it('옵션이 모두 알아본 판매 중지면 판매중이 아니고, 하나라도 판매중이면 리스팅 판정을 따른다', () => {
    expect(resolveChannelListingSaleState({ isActive: true, listingStatus: '승인완료', optionStatuses: ['DENIED', '품절'] })).toBe('off_sale');
    expect(resolveChannelListingSaleState({ isActive: true, listingStatus: '승인완료', optionStatuses: ['품절', 'on_sale'] })).toBe('on_sale');
  });
  it('상태 글자 분류는 공백·대소문자를 무시하고 사방넷 접두를 안다', () => {
    expect(classifyChannelListingSaleStatus(' 판매중 ')).toBe('on_sale');
    expect(classifyChannelListingSaleStatus('ON_SALE')).toBe('on_sale');
    expect(classifyChannelListingSaleStatus('사방넷:완전품절')).toBe('off_sale');
    expect(classifyChannelListingSaleStatus('')).toBe('unknown');
  });
});
