import { describe, expect, it } from 'vitest';
import {
  listingStatePill,
  mallAccentClass,
  mallMonogram,
  mallStopBadge,
  productMonogram,
  MALL_LISTING_STATE_PRESENTATION,
  MALL_READINESS_LABEL,
  MALL_STOP_TONE,
} from './mall-presentation';

describe('mallAccentClass', () => {
  it('같은 몰은 언제나 같은 색이다 — 표에서 열을 눈으로 따라가야 한다', () => {
    expect(mallAccentClass('coupang')).toBe(mallAccentClass('coupang'));
  });

  it('다른 몰은 대체로 다른 색을 받는다', () => {
    const keys = ['coupang', 'rocket', 'kidsnote', 'lotteon', 'gmarket'];
    expect(new Set(keys.map(mallAccentClass)).size).toBeGreaterThan(1);
  });
});

describe('mallMonogram', () => {
  it('한글은 첫 글자 하나', () => {
    expect(mallMonogram('키즈노트')).toBe('키');
  });

  it('영문은 앞 두 글자 대문자', () => {
    expect(mallMonogram('Coupang Wing')).toBe('CO');
  });

  it('빈 이름도 깨지지 않는다', () => {
    expect(mallMonogram('   ')).toBe('?');
  });
});

describe('MALL_LISTING_STATE_PRESENTATION', () => {
  it('오류와 확인필요만 사람을 부른다', () => {
    const attention = Object.entries(MALL_LISTING_STATE_PRESENTATION)
      .filter(([, value]) => value.attention)
      .map(([key]) => key);
    expect(attention.sort()).toEqual(['error', 'unknown']);
  });

  it('모든 상태에 라벨이 있다', () => {
    for (const value of Object.values(MALL_LISTING_STATE_PRESENTATION)) {
      expect(value.label.length).toBeGreaterThan(0);
    }
  });
});

describe('productMonogram', () => {
  it('앞의 가격코드를 건너뛴다 — 안 그러면 타일이 전부 숫자가 된다', () => {
    // 우리 상품명은 대부분 이렇게 생겼다.
    expect(productMonogram('3000심쿵!뽑기왕')).toBe('심');
    expect(productMonogram('700국어노트(8칸)')).toBe('국');
    expect(productMonogram('50000전문가용메탈요요')).toBe('전');
  });

  it('숫자로만 된 이름도 깨지지 않는다', () => {
    expect(productMonogram('3000')).toBe('3');
  });

  it('영문 상품은 앞 두 글자', () => {
    expect(productMonogram('LED Light Ball')).toBe('LE');
  });

  it('몰 이름 규칙과는 다르다 — 11번가는 몰에서 숫자를 지키다', () => {
    expect(mallMonogram('11번가')).toBe('1');
  });
});

/**
 * 같은 판매중지가 몰에서 지금 읽은 칸은 빨강, 사방넷에서 가져온 칸은 회색이었다(사장님 2026-09-19 "색상 같은데?").
 * 가져온 상태와 지금 읽은 상태가 한 표에서 말과 색을 받는다.
 */
describe('mallStopBadge · listingStatePill', () => {
  it('판매중지는 어디서 왔든 빨강이다', () => {
    expect(mallStopBadge('사방넷 일시중지')).toEqual({ kind: 'sold_out', label: '판매중지' });
    expect(mallStopBadge('판매중지')).toEqual({ kind: 'sold_out', label: '판매중지' });
    expect(listingStatePill('paused', '사방넷 일시중지')).toEqual({ label: '판매중지', tone: MALL_STOP_TONE.sold_out, kind: 'sold_out' });
    // 원문이 아는 말이 아니어도(영문 paused) 판매중지는 빨강이다.
    expect(listingStatePill('paused', 'paused')).toMatchObject({ label: '판매중지', kind: null });
    expect(listingStatePill('paused', 'paused').tone).toContain('rose');
  });

  it('몰 관리자 품절 · 판매종료 · 사방넷 완전품절을 판매중지 · 단종으로 접지 않는다', () => {
    expect(listingStatePill('paused', '품절')).toMatchObject({ label: '품절', kind: 'sold_out' });
    expect(listingStatePill('paused', '미노출')).toMatchObject({ label: '미노출', kind: 'ended' });
    expect(listingStatePill('paused', '보류')).toMatchObject({ label: '보류', kind: 'blocked' });
    expect(listingStatePill('discontinued', '판매종료')).toMatchObject({ label: '판매종료', kind: 'ended' });
    expect(listingStatePill('discontinued', '사방넷 완전품절')).toMatchObject({ label: '완전품절', kind: 'sold_out' });
    expect(listingStatePill('reviewing', '사방넷 대기중')).toMatchObject({ label: '미승인', kind: 'pending' });
    expect(listingStatePill('reviewing', '승인대기')).toMatchObject({ label: '미승인', kind: 'pending' });
    expect(listingStatePill('error', '반려')).toMatchObject({ label: '반려', kind: 'blocked' });
    // 떠리몰 판매중지는 우리 어휘 `일시중지` 로 들어온다 — 칸은 판매중지(빨강)로 적는다.
    expect(listingStatePill('paused', '일시중지')).toMatchObject({ label: '판매중지', kind: 'sold_out' });
    expect(mallStopBadge('승인거부')).toEqual({ kind: 'blocked', label: '승인거부' });
  });

  it('판매중 · 미등록 · 모르는 말은 우리 어휘 그대로다', () => {
    expect(listingStatePill('published', '사방넷 공급중')).toMatchObject({ label: '등록', kind: null });
    expect(listingStatePill('unregistered', null)).toMatchObject({ label: '미등록', kind: null });
    expect(listingStatePill('unknown', '미확인')).toMatchObject({ label: '확인필요', kind: null });
    expect(mallStopBadge('toString')).toBeNull();
    expect(mallStopBadge(null)).toBeNull();
  });
});

describe('MALL_READINESS_LABEL', () => {
  it('등록 기본값이 없는 몰은 어디서 채우는지 알려 준다 — 쇼핑몰 계정 설정 창에 칸이 생겼다(KID-235)', () => {
    expect(MALL_READINESS_LABEL.needs_profile).toBe('등록 기본값 없음 — 쇼핑몰 계정 설정에서 입력');
  });
});
