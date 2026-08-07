import { describe, expect, it } from 'vitest';
import {
  formatRetrievalContext,
  retrieveDocuments,
  tokenizeQuery,
  type AssistantDocument,
} from '../sourcing-assistant-retrieval';

function doc(overrides: Partial<AssistantDocument> = {}): AssistantDocument {
  return {
    id: 'keyword_analysis:board:완구-인형:포켓몬카드',
    kind: 'keyword',
    title: '완구/인형 1위: 포켓몬카드',
    text: '키워드 분석 보드 완구/인형. 포켓몬카드는 1위 키워드.',
    tags: ['포켓몬카드', '완구/인형'],
    sourceScope: 'keyword_analysis',
    sourceDate: '2026-07-18',
    metadata: {},
    ...overrides,
  };
}

describe('tokenizeQuery', () => {
  it('불용어와 한 글자 토큰을 버린다', () => {
    expect(tokenizeQuery('지금 이거 뭐가 좋아')).not.toContain('지금');
    expect(tokenizeQuery('지금 이거 뭐가 좋아')).not.toContain('이거');
  });

  it('조사가 붙은 형태에서 어근을 함께 낸다', () => {
    const terms = tokenizeQuery('포켓몬카드가 어때');
    expect(terms).toContain('포켓몬카드');
  });

  it('영문/숫자도 토큰으로 잡는다', () => {
    expect(tokenizeQuery('1688 offer 검색')).toEqual(
      expect.arrayContaining(['1688', 'offer', '검색']),
    );
  });

  it('의미 있는 토큰이 없으면 빈 배열이다', () => {
    expect(tokenizeQuery('그 좀 수')).toEqual([]);
  });
});

describe('retrieveDocuments', () => {
  it('질문 토큰이 걸린 문서만 돌려준다', () => {
    const documents = [doc(), doc({ id: 'other', title: '팬시문구 1위: 다이어리', text: '다이어리 관련', tags: ['다이어리'] })];
    const found = retrieveDocuments({ documents, query: '포켓몬카드 어때', limit: 5 });

    expect(found).toHaveLength(1);
    expect(found[0].id).toBe(documents[0].id);
    expect(found[0].matchedTerms).toContain('포켓몬카드');
  });

  it('제목/태그에 걸린 문서를 본문에만 걸린 문서보다 위에 둔다', () => {
    const documents = [
      doc({ id: 'body-only', title: '완구/인형 3위: 블록', tags: ['블록'], text: '비교 대상으로 포켓몬카드 언급' }),
      doc({ id: 'title-hit' }),
    ];
    const found = retrieveDocuments({ documents, query: '포켓몬카드', limit: 5 });
    expect(found[0].id).toBe('title-hit');
  });

  it('질문 토큰을 더 많이 덮은 문서를 위에 둔다', () => {
    const documents = [
      doc({ id: 'one-term', title: '포켓몬카드 보드', tags: [], text: '포켓몬카드' }),
      doc({ id: 'two-terms', title: '포켓몬카드 급상승', tags: ['급상승'], text: '포켓몬카드 급상승 신호' }),
    ];
    const found = retrieveDocuments({ documents, query: '포켓몬카드 급상승', limit: 5 });
    expect(found[0].id).toBe('two-terms');
  });

  it('limit 을 넘지 않는다', () => {
    const documents = Array.from({ length: 10 }, (_, i) => doc({ id: `d${i}` }));
    expect(retrieveDocuments({ documents, query: '포켓몬카드', limit: 3 })).toHaveLength(3);
  });

  it('문서나 토큰이 없으면 빈 배열이다', () => {
    expect(retrieveDocuments({ documents: [], query: '포켓몬카드', limit: 5 })).toEqual([]);
    expect(retrieveDocuments({ documents: [doc()], query: '그 좀', limit: 5 })).toEqual([]);
  });

  it('모든 문서에 있는 흔한 토큰만으로는 순위를 뒤집지 않는다', () => {
    // '키워드' 는 두 문서 모두에 있어 IDF 가 0 에 수렴한다.
    const documents = [
      doc({ id: 'common-only', title: '키워드 모음', tags: [], text: '키워드' }),
      doc({ id: 'specific', title: '키워드: 포켓몬카드', tags: ['포켓몬카드'], text: '키워드 포켓몬카드' }),
    ];
    const found = retrieveDocuments({ documents, query: '키워드 포켓몬카드', limit: 5 });
    expect(found[0].id).toBe('specific');
  });
});

describe('formatRetrievalContext', () => {
  it('근거마다 번호를 붙여 모델이 인용할 수 있게 한다', () => {
    const found = retrieveDocuments({ documents: [doc()], query: '포켓몬카드', limit: 5 });
    const context = formatRetrievalContext(found);

    expect(context).toContain('[1]');
    expect(context).toContain('완구/인형 1위: 포켓몬카드');
    expect(context).toContain('2026-07-18');
  });

  it('근거가 없으면 비었다고 분명히 적는다', () => {
    expect(formatRetrievalContext([])).toBe('(검색된 내부 문서 없음)');
  });
});
