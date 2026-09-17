import { describe, expect, it } from 'vitest';
import {
  MALL_PUBLISH_ADAPTERS,
  getMallPublishAdapter,
  hasMallPublishAdapter,
  registrationAdapterFor,
} from './index';

/**
 * 레지스트리 계약.
 *
 * 몰을 늘리는 유일한 경로가 여기라서, 새 어댑터가 계약을 깨고 들어오면 화면이
 * 조용히 이상해진다. 그걸 여기서 막는다.
 */
describe('몰 등록 어댑터 레지스트리', () => {
  it('등록된 몰 목록이 레지스트리와 같다', () => {
    expect(MALL_PUBLISH_ADAPTERS.map((a) => a.mallKey).sort())
      .toEqual(['11st', 'always', 'art09', 'boribori', 'coupang', 'domeggook', 'gmarket', 'gs-shop', 'icecream-mall', 'kidkids', 'kidsnote', 'kkomangse', 'lotte-on', 'onch', 'smartstore', 'ssg', 'teacher-mall', 'thirtymall']);
  });

  it('몰키가 서버 매니페스트 키와 같다', () => {
    // 화면은 이 키로 채널 계정을 찾아 불을 켜고 로고를 고른다. 확장에 넘기는 이름
    // (`artgonggu`·`alwayz`·`teacherville`)과 다른 것이 정상이다 — 그건 확장 안의
    // 폼 스펙 이름이다. 여기 키는 `mall-adapter-manifest.ts` 의 `key` 여야 한다.
    // 어긋나면 계정이 있는데도 카드가 빨강으로 남고 등록현황 열이 통째로 빈다.
    const manifestKeys = new Set([
      'coupang', 'kidsnote', 'domeggook', 'onch', 'art09', 'always', 'teacher-mall', '11st',
      'icecream-mall', 'gmarket', 'boribori', 'kkomangse', 'thirtymall', 'kidkids', 'ssg', 'smartstore', 'gs-shop',
      'lotte-on',
    ]);
    for (const adapter of MALL_PUBLISH_ADAPTERS) {
      expect(manifestKeys.has(adapter.mallKey)).toBe(true);
    }
  });

  /**
   * ESM Plus 는 한 번 등록하면 G마켓과 옥션 양쪽에 올라간다(실측 2026-09-11:
   * 빈 폼의 `판매사이트` 에 둘 다 켜진 채로 열린다). 매니페스트도 같은 사실을
   * 적어 두고 있다 — `gmarket` 은 "ESM 1콜로 지마켓+옥션 동시 등록".
   *
   * 그래서 `auction` 어댑터를 따로 만들면 같은 폼을 두 번 열어 같은 상품을 두 번
   * 올린다. 여기서 막는다.
   */
  it('⭐ 옥션 어댑터를 따로 두지 않는다 — G마켓 등록 한 번이 옥션까지다', () => {
    expect(hasMallPublishAdapter('auction')).toBe(false);
    expect(getMallPublishAdapter('gmarket')?.mallName).toBe('G마켓 · 옥션');
  });

  /**
   * 버튼은 없지만 옥션에도 올라간다. 허브가 옥션 상품등록을 '아직' 으로 칠하면
   * "옥션은 따로 등록해야 하나" 로 읽힌다(사장님 지적 2026-09-11).
   */
  it('옥션은 G마켓 등록에 함께 올라가는 몰로 찾아진다', () => {
    expect(registrationAdapterFor('auction')?.mallKey).toBe('gmarket');
    expect(registrationAdapterFor('gmarket')?.mallKey).toBe('gmarket');
    expect(registrationAdapterFor('toss')).toBeNull();
  });

  it('몰키가 겹치지 않는다', () => {
    const keys = MALL_PUBLISH_ADAPTERS.map((a) => a.mallKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('전부 사람이 제출한다 — 자동 제출하는 몰이 없다', () => {
    for (const adapter of MALL_PUBLISH_ADAPTERS) {
      expect(adapter.requiresOperatorSubmit).toBe(true);
    }
  });

  it('폼 방식은 한 번에 하나씩만 처리한다 — 탭 하나를 점유한다', () => {
    for (const adapter of MALL_PUBLISH_ADAPTERS.filter((a) => a.mode === 'form')) {
      expect(adapter.batchSize).toBe(1);
    }
  });

  it('모든 어댑터가 필수 계약을 갖춘다', () => {
    for (const adapter of MALL_PUBLISH_ADAPTERS) {
      expect(adapter.mallName.length).toBeGreaterThan(0);
      expect(['form', 'excel', 'api']).toContain(adapter.mode);
      expect(typeof adapter.preview).toBe('function');
      expect(typeof adapter.validate).toBe('function');
      expect(typeof adapter.send).toBe('function');
      // 필수 칸은 기본값이 있거나 사람이 채워야 한다고 표시돼야 한다.
      for (const field of adapter.fields) {
        expect(field.label.length).toBeGreaterThan(0);
        expect(['master', 'template', 'override']).toContain(field.origin);
      }
    }
  });

  it('키로 찾을 수 있고 없는 키는 null 이다', () => {
    expect(getMallPublishAdapter('domeggook')?.mallName).toBe('도매꾹');
    expect(getMallPublishAdapter('onch')?.mallName).toBe('온채널');
    expect(getMallPublishAdapter('없는몰')).toBeNull();
    expect(hasMallPublishAdapter('kidsnote')).toBe(true);
  });

  it('공급가가 비어도 온채널을 막지 않는다 — 우리 데이터에 없는 값이다', () => {
    // 셀피아 매입가·판매가 어느 쪽과도 맞지 않는 거래 조건이라 사람이 정한다.
    // 모달에서 버튼을 잠그는 것보다 열린 탭에서 채우게 하는 편이 낫다.
    const onch = getMallPublishAdapter('onch');
    const problems = onch!.validate(
      { candidateId: 'c1', name: '상품', salePrice: 1000, thumbnailUrl: null },
      { supplyPrice: '', packQuantity: '1' },
    );
    expect(problems).toEqual([]);
  });
});

describe('목록 판매가 판정', () => {
  const item = (salePrice: number | null) => ({
    candidateId: 'c1', name: '상품', salePrice, thumbnailUrl: null,
  });

  it('null 은 모른다는 뜻이라 막지 않는다', () => {
    // 수집상품 목록에는 가격 컬럼이 없다. 실제 판매가는 상세를 열 때
    // 셀피아 이름매칭으로 붙는다(라이브 확인: 4000과일바구니딸깍이키링 → 2,200원).
    for (const adapter of MALL_PUBLISH_ADAPTERS.filter((a) => a.mode === 'form')) {
      const values = Object.fromEntries(adapter.fields.map((f) => [f.key, f.defaultValue || '1']));
      const problems = adapter.validate(item(null), values);
      expect(problems.some((p) => p.includes('판매가'))).toBe(false);
    }
  });

  it('명시적 0원은 막는다', () => {
    for (const adapter of MALL_PUBLISH_ADAPTERS.filter((a) => a.mode === 'form')) {
      const values = Object.fromEntries(adapter.fields.map((f) => [f.key, f.defaultValue || '1']));
      const problems = adapter.validate(item(0), values);
      expect(problems.some((p) => p.includes('판매가가 0원'))).toBe(true);
    }
  });
});
