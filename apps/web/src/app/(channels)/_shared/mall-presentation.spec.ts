import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHANNEL_REGISTRY } from '@kiditem/shared/channel-registry';
import { MallPreflightRuleSchema } from '@kiditem/shared/mall-publishing';
import {
  mallAccentClass,
  mallMonogram,
  productMonogram,
  MALL_LISTING_STATE_PRESENTATION,
  MALL_READINESS_LABEL,
  MALL_READINESS_TONE,
  PREFLIGHT_RULE_LABEL,
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

describe('PREFLIGHT_RULE_LABEL', () => {
  it('막힌 이유마다 사람이 읽을 이름이 있다 — 규칙 키를 화면에 내보내지 않는다', () => {
    for (const rule of MallPreflightRuleSchema.options) {
      expect(PREFLIGHT_RULE_LABEL[rule]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  /** 품절은 "보낼 수 없다"가 아니라 "지금은 보내지 않는다"다. 재고 칸의 이름으로 부른다. */
  it('⭐ 품절 차단에도 이름이 있다', () => {
    expect(PREFLIGHT_RULE_LABEL.out_of_stock).toBe('재고');
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

describe('몰 준비 상태 표시', () => {
  /**
   * 라벨은 몰이 지금 어떤가를 말한다. 우리 화면이 아직 없다는 사정(KID-235)은 사장님이
   * 읽을 말이 아니다 — 등록 기본값이 없다는 사실과 그래도 보낼 수 있다는 것만 적고, 색은
   * 할 일을 부르는 호박색이 아니라 '보낼 수 있다'와 같이 둔다.
   */
  it('⭐ 등록 기본값 없음은 우리 사정이 아니라 몰 상태로 적는다', () => {
    expect(MALL_READINESS_LABEL.needs_profile).toBe('등록 기본값 없음 — 송신에는 영향 없음');
    expect(MALL_READINESS_TONE.needs_profile).toBe(MALL_READINESS_TONE.ready);
  });

  it('계정이 없는 몰은 여전히 사람을 부른다', () => {
    expect(MALL_READINESS_LABEL.needs_account).toBe('계정 정보 필요');
    expect(MALL_READINESS_TONE.needs_account).not.toBe(MALL_READINESS_TONE.ready);
  });
});

/**
 * 로고 경로는 채널 레지스트리에만 있다(KID-250). 파일이 없으면 표와 타일에 깨진 이미지가
 * 서므로, 파일이 실제로 있는지는 파일을 가진 쪽에서 지킨다.
 */
describe('몰 로고 파일', () => {
  const PUBLIC_DIR = path.resolve(process.cwd(), 'public');

  it('⭐ 레지스트리가 가리키는 파비콘 파일이 모두 있다', () => {
    for (const entry of CHANNEL_REGISTRY) {
      if (entry.logo === null) continue;
      expect([entry.key, existsSync(path.join(PUBLIC_DIR, entry.logo))]).toEqual([entry.key, true]);
    }
  });

  /** 사이트가 접속되지 않아 파비콘을 못 받은 몰. 아무 아이콘이나 붙이지 않고 비워 둔다. */
  it('파일이 없는 채널은 원폴라리스뿐이고, 화면은 머리글자로 대신한다', () => {
    expect(CHANNEL_REGISTRY.filter((entry) => entry.logo === null).map((entry) => entry.key))
      .toEqual(['one-polaris']);
    expect(mallMonogram('원폴라리스')).toBe('원');
  });
});
