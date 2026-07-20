import { describe, expect, it } from 'vitest';
import {
  inferCoupangCategory,
  parseCoupangCategoryCell,
  scoreNameSimilarity,
  tokenizeProductName,
  type CategoryCorpusEntry,
} from './coupang-category-inference';

// 실제 channel_listings.category 에 적재된 값들(쿠팡 워크북 passthrough).
const WATERGUN = '[77390] 완구/취미>스포츠/야외완구>물총';
const BOARDGAME = '[77448] 완구/취미>보드게임>기타보드게임';
const STATIONERY = '[79914] 문구/오피스>문구/학용품>과목별준비물>학용품세트/문구세트';
const KEYHOLDER = '[64687] 생활용품>생활소품>열쇠고리/키홀더';

describe('parseCoupangCategoryCell', () => {
  it('WING 폼 형식 "[코드] 경로" 를 코드·경로·leaf 로 분해한다', () => {
    expect(parseCoupangCategoryCell(WATERGUN)).toEqual({
      raw: WATERGUN,
      code: 77390,
      path: '완구/취미>스포츠/야외완구>물총',
      leaf: '물총',
    });
  });

  it('코드는 쿠팡 getCategories 의 displayItemCategoryCode 와 일치한다', () => {
    // 라이브 API 검증값: 물총=77390, 기타보드게임=77448, 학용품세트=79914
    expect(parseCoupangCategoryCell(BOARDGAME)?.code).toBe(77448);
    expect(parseCoupangCategoryCell(STATIONERY)?.code).toBe(79914);
  });

  it('경로 조각의 공백을 정리하고 마지막 조각을 leaf 로 잡는다', () => {
    const parsed = parseCoupangCategoryCell('[123]  가 > 나 > 다  ');
    expect(parsed?.path).toBe('가>나>다');
    expect(parsed?.leaf).toBe('다');
  });

  it('실데이터에 섞인 이형 "64681/1937" 는 null 로 거른다', () => {
    expect(parseCoupangCategoryCell('64681/1937')).toBeNull();
  });

  it('코드가 없거나 경로가 없으면 null', () => {
    expect(parseCoupangCategoryCell('완구/취미>보드게임')).toBeNull();
    expect(parseCoupangCategoryCell('[77390]')).toBeNull();
    expect(parseCoupangCategoryCell('[77390] 단일경로')).toBeNull();
    expect(parseCoupangCategoryCell('')).toBeNull();
  });
});

describe('tokenizeProductName', () => {
  it('수량·단위 토큰을 제거한다', () => {
    const tokens = tokenizeProductName('스폰지밥 물총 2개입 500ml');
    expect(tokens.has('물총')).toBe(true);
    expect(tokens.has('2개입')).toBe(false);
    expect(tokens.has('500ml')).toBe(false);
  });

  it('판촉 문구를 제거한다', () => {
    const tokens = tokenizeProductName('공룡 보드게임 랜덤발송 상세페이지 참조');
    expect(tokens.has('보드게임')).toBe(true);
    expect(tokens.has('랜덤발송')).toBe(false);
    expect(tokens.has('상세페이지')).toBe(false);
    expect(tokens.has('참조')).toBe(false);
  });

  it('대괄호 등 구두점을 경계로 처리한다', () => {
    expect(tokenizeProductName('[키디템] 물총').has('물총')).toBe(true);
  });
});

describe('scoreNameSimilarity', () => {
  it('같은 품목이면 다른 품목보다 높은 점수를 준다', () => {
    const same = scoreNameSimilarity('대형 물총 장난감', '초강력 물총 워터건');
    const different = scoreNameSimilarity('대형 물총 장난감', '유아 보드게임 세트');
    expect(same).toBeGreaterThan(different);
  });

  it('완전히 무관하면 0 에 가깝다', () => {
    expect(scoreNameSimilarity('물총', '학용품세트')).toBeLessThan(0.2);
  });
});

describe('inferCoupangCategory', () => {
  const corpus: CategoryCorpusEntry[] = [
    { displayName: '슈퍼 워터건 물총 대형', categoryCell: WATERGUN },
    { displayName: '펌프 물총 장난감', categoryCell: WATERGUN },
    { displayName: '공룡 보드게임 유아용', categoryCell: BOARDGAME },
    { displayName: '가족 보드게임 파티', categoryCell: BOARDGAME },
    { displayName: '초등 학용품세트 신학기', categoryCell: STATIONERY },
  ];

  it('상품명에 맞는 카테고리를 코퍼스에서 찾아낸다', () => {
    const result = inferCoupangCategory('여름 물총 워터건 대용량', corpus);
    expect(result?.cell.code).toBe(77390);
    expect(result?.cell.leaf).toBe('물총');
  });

  it('다른 품목은 다른 카테고리로 간다', () => {
    expect(inferCoupangCategory('신학기 학용품세트 준비물', corpus)?.cell.code).toBe(79914);
    expect(inferCoupangCategory('보드게임 파티용', corpus)?.cell.code).toBe(77448);
  });

  it('판단 근거가 된 기존 상품명을 함께 돌려준다', () => {
    const result = inferCoupangCategory('물총 워터건', corpus);
    expect(result?.basedOn.length).toBeGreaterThan(0);
    expect(result?.basedOn[0]).toContain('물총');
  });

  it('확신이 없으면 null 을 반환한다 — 하드코딩 카테고리로 대체하지 않기 위함', () => {
    expect(inferCoupangCategory('전동 드릴 공구함', corpus)).toBeNull();
  });

  it('유사도가 전혀 없으면 minScore 를 낮춰도 기권한다', () => {
    // k-NN 투표는 이웃이 하나도 없으면 추천할 근거 자체가 없다.
    // (임계값을 0 으로 낮췄다고 무관한 카테고리를 찍어주면 안 된다)
    expect(inferCoupangCategory('전동 드릴 공구함', corpus, { minScore: 0 })).toBeNull();
  });

  it('minScore 를 올리면 약한 매칭을 걸러낸다', () => {
    const weak = inferCoupangCategory('물총', corpus);
    expect(weak).not.toBeNull();
    expect(inferCoupangCategory('물총', corpus, { minScore: 0.99 })).toBeNull();
  });

  it('붙여쓰기 상품명도 띄어쓰기 코퍼스와 매칭된다 (셀피아↔쿠팡 표기 차이)', () => {
    // 셀피아는 '4000과일바구니딸깍이키링' 처럼 붙여쓰고, 쿠팡 노출상품명은 띄어쓴다.
    // 토큰 겹침이 0 이 되는 조합이라 bigram 겹침이 단독으로 판정할 수 있어야 한다.
    const spaced: CategoryCorpusEntry[] = [
      { displayName: '4구 스핀 딸깍이 키링 1p 휴대용 열쇠고리', categoryCell: KEYHOLDER },
    ];
    expect(inferCoupangCategory('4000과일바구니딸깍이키링', spaced)?.cell.raw).toBe(
      KEYHOLDER,
    );
  });

  it('점수에 따라 confidence 등급을 매긴다', () => {
    const strong = inferCoupangCategory('펌프 물총 장난감', corpus);
    expect(strong?.confidence).toBe('high');
  });

  it('빈 코퍼스나 빈 상품명은 null', () => {
    expect(inferCoupangCategory('물총', [])).toBeNull();
    expect(inferCoupangCategory('   ', corpus)).toBeNull();
  });

  it('파싱 불가한 카테고리 셀은 후보에서 제외한다', () => {
    const dirty: CategoryCorpusEntry[] = [
      { displayName: '물총 워터건', categoryCell: '64681/1937' },
      { displayName: '물총 대형', categoryCell: WATERGUN },
    ];
    expect(inferCoupangCategory('물총', dirty)?.cell.raw).toBe(WATERGUN);
  });

  it('support(코퍼스 사용 빈도)를 함께 보고한다', () => {
    expect(inferCoupangCategory('물총 워터건', corpus)?.support).toBe(2);
  });
});
