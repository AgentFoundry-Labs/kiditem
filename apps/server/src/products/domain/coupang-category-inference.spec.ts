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

  it('matches the Sellpia joined spelling to the existing spaced Coupang listing', () => {
    const corpus: CategoryCorpusEntry[] = [
      {
        displayName: '4구 스핀 딸깍이 키링 1p 휴대용 열쇠고리',
        categoryCell: KEYHOLDER,
      },
    ];

    const result = inferCoupangCategory('4000과일바구니딸깍이키링', corpus);

    expect(result?.cell.raw).toBe(KEYHOLDER);
    expect(result?.confidence).toBe('high');
    expect(result?.basedOn).toEqual(['4구 스핀 딸깍이 키링 1p 휴대용 열쇠고리']);
  });
});
