import { describe, expect, it } from 'vitest';
import {
  inferCoupangCategory,
  parseCoupangCategoryCell,
  scoreNameSimilarity,
  tokenizeProductName,
  type CategoryCorpusEntry,
} from './coupang-category-inference';

const WATERGUN = '[77390] 완구/취미>스포츠/야외완구>물총';
const BOARDGAME = '[77448] 완구/취미>보드게임>기타보드게임';
const KEYHOLDER = '[64687] 생활용품>생활소품>열쇠고리/키홀더';
const TOUCH_TOY = '[77291] 완구/취미>신생아/영아완구>촉감발달완구';
const CATCH_BALL = '[77386] 완구/취미>스포츠/야외완구>캐치볼';

describe('Coupang category inference', () => {
  it('parses the exact WING category cell contract', () => {
    expect(parseCoupangCategoryCell(WATERGUN)).toEqual({
      raw: WATERGUN,
      code: 77390,
      path: '완구/취미>스포츠/야외완구>물총',
      leaf: '물총',
    });
    expect(parseCoupangCategoryCell('64681/1937')).toBeNull();
  });

  it('infers a category from existing Coupang listing names without a hard-coded fallback', () => {
    const corpus: CategoryCorpusEntry[] = [
      { displayName: '슈퍼 워터건 물총 대형', categoryCell: WATERGUN },
      { displayName: '펌프 물총 장난감', categoryCell: WATERGUN },
      { displayName: '공룡 보드게임 유아용', categoryCell: BOARDGAME },
    ];

    expect(inferCoupangCategory('여름 물총 워터건 대용량', corpus)?.cell.raw).toBe(WATERGUN);
    expect(inferCoupangCategory('전동 드릴 공구함', corpus)).toBeNull();
  });

  it('ignores quantity and promotion tokens while retaining product meaning', () => {
    const tokens = tokenizeProductName('스폰지밥 물총 2개입 500ml 랜덤발송 상세페이지 참조');

    expect(tokens.has('물총')).toBe(true);
    expect(tokens.has('2개입')).toBe(false);
    expect(tokens.has('500ml')).toBe(false);
    expect(tokens.has('랜덤발송')).toBe(false);
    expect(tokens.has('상세페이지')).toBe(false);
  });

  it('scores the same product kind above an unrelated product', () => {
    expect(scoreNameSimilarity('대형 물총 장난감', '초강력 물총 워터건')).toBeGreaterThan(
      scoreNameSimilarity('대형 물총 장난감', '유아 보드게임 세트'),
    );
  });

  it('keeps a joined-spelling similarity result as a reviewable suggestion', () => {
    const corpus: CategoryCorpusEntry[] = [
      {
        displayName: '4구 스핀 딸깍이 키링 1p 휴대용 열쇠고리',
        categoryCell: KEYHOLDER,
      },
    ];

    const result = inferCoupangCategory('4000과일바구니딸깍이키링', corpus);

    expect(result?.cell.raw).toBe(KEYHOLDER);
    expect(result?.confidence).toBe('medium');
    expect(result?.basedOn).toEqual(['4구 스핀 딸깍이 키링 1p 휴대용 열쇠고리']);
  });

  // 예전에는 `high` 가 identity match 에서만 나와, 신규 소싱 상품은 구조적으로 절대
  // 자동적용되지 않았다(웹은 high 만 적용). 라이브 코퍼스 1145건 실측에서 아래 조합은
  // 정확히 물총을 맞혔지만 medium 이라 카테고리가 비어 WING 등록이 통째로 막혔다.
  it('auto-applies a strongly agreed similarity match for a brand-new product name', () => {
    const corpus: CategoryCorpusEntry[] = [
      { displayName: '울트라 펌프 배틀건 (1p) 대형 어린이 물총 물놀이 워터건', categoryCell: WATERGUN },
      { displayName: '엔젤윙 롱스틱 물총 (1p) 스틱 펌프형 어린이 물총 물놀이 워터건', categoryCell: WATERGUN },
      { displayName: '해피글로우 야광봉 (30개입) 불빛 파티 행사', categoryCell: KEYHOLDER },
    ];

    const result = inferCoupangCategory('어린이 물놀이 워터건 대용량 물총', corpus);

    expect(result?.cell.raw).toBe(WATERGUN);
    expect(result?.confidence).toBe('high');
  });

  // 점수만으로는 정답과 오답이 갈리지 않아 이웃 합의율을 함께 요구한다. 이웃이
  // 서로 다른 카테고리로 흩어지면 자동적용하지 않고 사람이 고르게 남긴다.
  it('keeps a split-neighbour similarity match out of auto-apply', () => {
    const corpus: CategoryCorpusEntry[] = [
      { displayName: '어린이 물총 물놀이 워터건', categoryCell: WATERGUN },
      { displayName: '어린이 물놀이 튜브 워터파크', categoryCell: KEYHOLDER },
    ];

    const result = inferCoupangCategory('어린이 물놀이 워터', corpus);

    expect(result?.confidence).not.toBe('high');
  });

  it('prioritizes the exact registered Coupang product identity from the catalog workbook', () => {
    const corpus: CategoryCorpusEntry[] = [
      {
        registeredName: '3500꿀사과슬랑이',
        displayName: '꿀사과 슬랑이 (1p) 촉감놀이 주물럭 스퀴시 스트레스해소 쫀득이',
        categoryCell: TOUCH_TOY,
      },
      {
        registeredName: '11000 찍찍이 가방 캐치볼 세트',
        displayName: '찍찍이 가방 캐치볼 세트 판2개 볼2개',
        categoryCell: CATCH_BALL,
      },
      {
        registeredName: '2500해피글로우야광원반던지기',
        displayName: '해피글로우 야광 원반던지기 불빛 LED 야외 놀이',
        categoryCell: CATCH_BALL,
      },
    ];

    const result = inferCoupangCategory('꿀사과슬랑이', corpus);

    expect(result?.cell.raw).toBe(TOUCH_TOY);
    expect(result?.confidence).toBe('high');
    expect(result?.basedOn).toContain('3500꿀사과슬랑이');
  });

  it('keeps a conflicting registered-name match out of high confidence', () => {
    const corpus: CategoryCorpusEntry[] = [
      {
        registeredName: '3000공룡팽이',
        displayName: '공룡 팽이 장난감',
        categoryCell: BOARDGAME,
      },
      {
        registeredName: '5000공룡팽이',
        displayName: '공룡 팽이 야외완구',
        categoryCell: CATCH_BALL,
      },
    ];

    expect(inferCoupangCategory('공룡팽이', corpus)?.confidence).not.toBe('high');
  });
});
