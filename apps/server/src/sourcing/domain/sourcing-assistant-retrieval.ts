/**
 * 소싱 어시스턴트의 문서 검색(RAG 의 R).
 *
 * 임베딩 모델을 쓰지 않는다. 코퍼스가 수백 건 규모이고 한국어 상품/키워드 위주라
 * 토큰 겹침 + 역문서빈도(IDF) 가중만으로 충분하며, 무엇보다 **LLM 없이도 동작**한다.
 * 검색은 항상 성공하고, 생성(CLI)만 실패할 수 있게 분리하는 것이 이 설계의 목적이다.
 *
 * 순수 함수만 둔다 — NestJS/Prisma/IO 없음.
 */

export interface AssistantDocument {
  id: string;
  kind: string;
  title: string;
  text: string;
  tags: string[];
  sourceScope: string;
  sourceDate: string | null;
  metadata: Record<string, unknown>;
}

export interface RetrievedDocument extends AssistantDocument {
  score: number;
  /** 질문의 어떤 토큰이 걸렸는지. 답변에 근거를 붙일 때 쓴다. */
  matchedTerms: string[];
}

/** 한국어 조사/불용어. 이것들이 걸리면 거의 모든 문서가 매칭돼 순위가 무의미해진다. */
const STOPWORDS = new Set([
  '그리고', '그런데', '하지만', '어떤', '무엇', '뭐가', '뭔가', '어떻게', '왜', '지금',
  '해줘', '알려줘', '보여줘', '해봐', '있어', '없어', '이거', '저거', '그거', '너무',
  '좀', '수', '것', '들', '및', '등', '의', '가', '이', '은', '는', '을', '를', '에',
  '와', '과', '로', '으로', '에서', '부터', '까지', '한', '그', '더', '중', '내',
]);

const MIN_TERM_LENGTH = 2;

/**
 * 질문을 검색 토큰으로 쪼갠다.
 *
 * 한국어는 띄어쓰기만으로는 조사가 붙어 나오므로("원피스가"), 꼬리 조사를 한 겹
 * 벗겨 낸 형태도 함께 후보에 넣는다. 형태소 분석기를 붙이지 않는 대신의 타협이다.
 */
export function tokenizeQuery(query: string): string[] {
  const raw = query
    .normalize('NFKC')
    .toLowerCase()
    .split(/[^0-9a-z가-힣]+/u)
    .filter((token) => token.length >= MIN_TERM_LENGTH && !STOPWORDS.has(token));

  const expanded = new Set<string>();
  for (const token of raw) {
    expanded.add(token);
    const stripped = stripKoreanParticle(token);
    if (stripped.length >= MIN_TERM_LENGTH) expanded.add(stripped);
  }
  return [...expanded];
}

const TRAILING_PARTICLES = ['에서는', '에서', '으로', '이라', '라는', '까지', '부터', '에게', '한테', '이나', '나', '은', '는', '이', '가', '을', '를', '의', '도', '만', '와', '과', '로', '에'];

function stripKoreanParticle(token: string): string {
  for (const particle of TRAILING_PARTICLES) {
    if (token.length > particle.length + 1 && token.endsWith(particle)) {
      return token.slice(0, -particle.length);
    }
  }
  return token;
}

export interface RetrieveInput {
  documents: AssistantDocument[];
  query: string;
  limit: number;
}

/**
 * 질문과 가장 가까운 문서를 고른다.
 *
 * 점수 = Σ(매칭 토큰의 IDF) × 필드 가중치. 제목/태그에서 걸린 토큰을 본문보다 크게
 * 친다 — 코퍼스가 "완구/인형 1위: 포켓몬카드" 같은 짧은 요약문이라 제목이 곧 핵심이다.
 */
export function retrieveDocuments(input: RetrieveInput): RetrievedDocument[] {
  const { documents, limit } = input;
  const terms = tokenizeQuery(input.query);
  if (terms.length === 0 || documents.length === 0) return [];

  const idf = buildIdf(documents, terms);

  const scored: RetrievedDocument[] = [];
  for (const doc of documents) {
    const haystackTitle = normalize(`${doc.title} ${doc.tags.join(' ')}`);
    const haystackBody = normalize(doc.text);

    let score = 0;
    const matchedTerms: string[] = [];

    for (const term of terms) {
      const inTitle = haystackTitle.includes(term);
      const inBody = haystackBody.includes(term);
      if (!inTitle && !inBody) continue;

      matchedTerms.push(term);
      score += (idf.get(term) ?? 0) * (inTitle ? 3 : 1);
    }

    if (matchedTerms.length === 0) continue;

    // 질문 토큰을 더 많이 덮은 문서를 올린다. 한 단어만 여러 번 걸린 문서보다 낫다.
    score *= 1 + matchedTerms.length / terms.length;

    // 최신 문서를 살짝 우대한다. 소싱 판단은 오래된 근거일수록 가치가 떨어진다.
    scored.push({ ...doc, score: round2(score), matchedTerms });
  }

  return scored
    .sort((a, b) => b.score - a.score || compareDateDesc(a.sourceDate, b.sourceDate))
    .slice(0, limit);
}

function buildIdf(documents: AssistantDocument[], terms: string[]): Map<string, number> {
  const idf = new Map<string, number>();
  const total = documents.length;

  for (const term of terms) {
    let hits = 0;
    for (const doc of documents) {
      if (normalize(`${doc.title} ${doc.tags.join(' ')} ${doc.text}`).includes(term)) hits += 1;
    }
    // 모든 문서에 있는 흔한 토큰은 0에 수렴한다.
    idf.set(term, hits === 0 ? 0 : Math.log((total + 1) / (hits + 1)) + 1);
  }
  return idf;
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLowerCase();
}

function compareDateDesc(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a < b ? 1 : -1;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * 검색된 문서를 LLM 에 넘길 컨텍스트 블록으로 만든다.
 *
 * 각 조각에 `[n]` 번호를 붙여, 모델이 근거 번호로 인용할 수 있게 한다. 번호가 없으면
 * 모델이 출처를 지어내기 쉬워진다.
 */
export function formatRetrievalContext(documents: RetrievedDocument[]): string {
  if (documents.length === 0) return '(검색된 내부 문서 없음)';

  return documents
    .map((doc, index) => {
      const date = doc.sourceDate ? ` · ${doc.sourceDate}` : '';
      return `[${index + 1}] (${doc.sourceScope}${date}) ${doc.title}\n${doc.text}`;
    })
    .join('\n\n');
}
