import { describe, expect, it } from 'vitest';
import {
  countPublished,
  needsAttention,
  resolveMallListingState,
  type MallListingState,
} from './mall-listing-state';

describe('resolveMallListingState', () => {
  it('리스팅도 시도도 없으면 미등록이다', () => {
    expect(resolveMallListingState({ hasListing: false })).toEqual({
      state: 'unregistered',
      basis: 'none',
      warning: null,
    });
  });

  it.each([
    ['승인완료', 'published'],
    ['활성', 'published'],
    ['active', 'published'],
    ['승인반려', 'error'],
    ['비활성', 'paused'],
    ['단종', 'discontinued'],
  ] as const)('쿠팡 원문 %s 를 %s 로 접는다', (status, expected) => {
    const result = resolveMallListingState({ hasListing: true, listingStatus: status });
    expect(result.state).toBe(expected);
    expect(result.basis).toBe('listing');
  });

  it('크롤로 존재만 아는 리스팅은 확인필요로 남긴다', () => {
    // observed 는 몰이 준 상태가 아니라 우리가 목록에서 본 것뿐이다.
    expect(resolveMallListingState({ hasListing: true, listingStatus: 'observed' }).state)
      .toBe('unknown');
    expect(resolveMallListingState({ hasListing: true, listingStatus: '미확인' }).state)
      .toBe('unknown');
  });

  it('쿠팡 적재의 draft 는 심사중과 반려를 뭉갠 값이라 확인필요로 둔다', () => {
    // normalizeCoupangProductStatus 가 UNDER_EXAMINATION 과 REJECTED 를 둘 다
    // 'draft' 로 접는다. 검수중으로 찍으면 반려된 절반이 조용히 숨는다.
    const result = resolveMallListingState({ hasListing: true, listingStatus: 'draft' });
    expect(result.state).toBe('unknown');
    expect(result.warning).toContain('심사중과 반려');
  });

  it('정규화된 쿠팡 값도 접는다', () => {
    expect(resolveMallListingState({ hasListing: true, listingStatus: 'paused' }).state).toBe('paused');
    expect(resolveMallListingState({ hasListing: true, listingStatus: 'deleted' }).state).toBe('discontinued');
  });

  it('확인필요는 왜 모르는지를 함께 남긴다', () => {
    expect(resolveMallListingState({ hasListing: true, listingStatus: 'observed' }).warning)
      .toContain('존재만 확인');
  });

  it.each([
    ['사방넷 공급중', 'published'],
    ['사방넷 일시중지', 'paused'],
    ['사방넷 완전품절', 'discontinued'],
    ['사방넷 대기중', 'reviewing'],
  ] as const)('사방넷에서 가져온 %s 를 %s 로 접고, 근거가 사방넷이라고 남긴다', (status, expected) => {
    const result = resolveMallListingState({ hasListing: true, listingStatus: status });
    expect(result.state).toBe(expected);
    expect(result.warning).toContain('사방넷 송신 기록 기준');
  });

  it.each([
    ['판매중', 'published'],
    ['품절', 'paused'],
    ['미노출', 'paused'],
    ['보류', 'paused'],
    ['승인대기', 'reviewing'],
    ['판매종료', 'discontinued'],
    ['반려', 'error'],
  ] as const)('몰 화면에서 직접 읽은 %s 를 %s 로 접고, 경고를 붙이지 않는다', (status, expected) => {
    const result = resolveMallListingState({ hasListing: true, listingStatus: status });
    expect(result.state).toBe(expected);
    expect(result.warning).toBeNull();
  });

  it('몰 화면 글자가 접히지 않으면(임시저장 · 전시) 확인필요로 둔다', () => {
    expect(resolveMallListingState({ hasListing: true, listingStatus: '임시저장 · 전시' }).state)
      .toBe('unknown');
  });

  it('사방넷 표시가 붙은 모르는 상태는 확인필요로 둔다', () => {
    expect(resolveMallListingState({ hasListing: true, listingStatus: '사방넷 처음보는상태' }).state)
      .toBe('unknown');
  });

  it('모르는 상태 문자열을 발행으로 추측하지 않는다', () => {
    expect(resolveMallListingState({ hasListing: true, listingStatus: '처음보는상태' }).state)
      .toBe('unknown');
  });

  it('상태가 비어 있어도 리스팅 존재 자체는 사실로 남긴다', () => {
    const result = resolveMallListingState({ hasListing: true, listingStatus: null });
    expect(result.state).toBe('unknown');
    expect(result.basis).toBe('listing');
  });

  it('보내는 중이면 리스팅보다 먼저다 — 가장 최신 사실이다', () => {
    const result = resolveMallListingState({
      hasListing: true,
      listingStatus: '승인완료',
      preparationStatus: 'submitting',
    });
    expect(result.state).toBe('reviewing');
    expect(result.basis).toBe('preparation');
  });

  it('리스팅이 살아 있으면 최근 실패가 상태를 뒤집지 않고 경고로 남는다', () => {
    // 상품은 여전히 팔리고 있다. 실패한 것은 수정 재전송이다.
    const result = resolveMallListingState({
      hasListing: true,
      listingStatus: '승인완료',
      preparationStatus: 'failed',
    });
    expect(result.state).toBe('published');
    expect(result.warning).toBe('최근 수정 전송이 실패했습니다.');
  });

  it('리스팅이 없고 시도가 실패했으면 오류다', () => {
    const result = resolveMallListingState({ hasListing: false, preparationStatus: 'failed' });
    expect(result).toEqual({ state: 'error', basis: 'preparation', warning: null });
  });

  it('초안만 있으면 준비중이다', () => {
    expect(resolveMallListingState({ hasListing: false, preparationStatus: 'draft' }).state)
      .toBe('preparing');
  });

  it('취소된 시도는 미등록과 같다', () => {
    const result = resolveMallListingState({ hasListing: false, preparationStatus: 'cancelled' });
    expect(result.state).toBe('unregistered');
    expect(result.basis).toBe('none');
  });

  it('대소문자와 공백을 무시한다', () => {
    expect(resolveMallListingState({ hasListing: true, listingStatus: '  ACTIVE ' }).state)
      .toBe('published');
  });
});

describe('countPublished / needsAttention', () => {
  it('발행만 센다', () => {
    const states: MallListingState[] = ['published', 'unregistered', 'published', 'error'];
    expect(countPublished(states)).toBe(2);
  });

  it('오류와 확인필요만 사람을 부른다', () => {
    expect(needsAttention('error')).toBe(true);
    expect(needsAttention('unknown')).toBe(true);
    expect(needsAttention('published')).toBe(false);
    expect(needsAttention('unregistered')).toBe(false);
  });
});
