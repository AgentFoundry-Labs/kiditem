export const SOURCING_AGENT_RAG_GENERATOR_VERSION = 'sourcing-agent-rag.v1';
export const SOURCING_AGENT_RAG_INDEX_VERSION = 1;

export const SOURCING_AGENT_RAG_SOURCE_SCOPES = [
  'keyword_analysis',
  'today_recommendations',
  'interest_tracking',
] as const;

export type SourcingAgentRagSourceScope = (typeof SOURCING_AGENT_RAG_SOURCE_SCOPES)[number];
export type SourcingAgentRagSuggestedFilter = 'all' | 'selected' | 'selling' | 'strong' | 'new' | 'wholesale';

export interface SourcingAgentRagSourceSnapshot {
  id: string;
  scope: SourcingAgentRagSourceScope;
  businessDate: string;
  payload: Record<string, unknown>;
  updatedAt: string;
}

export interface SourcingAgentRagDocument {
  id: string;
  sourceScope: SourcingAgentRagSourceScope;
  sourceSnapshotId: string;
  sourceDate: string;
  kind: 'interest' | 'recommendation' | 'keyword' | 'trend' | 'agent';
  title: string;
  text: string;
  tags: string[];
  metadata: Record<string, string | number | boolean | null>;
}

export interface SourcingAgentRagIndex {
  documents: SourcingAgentRagDocument[];
  stats: {
    documentCount: number;
    sourceSnapshotCount: number;
    sourceScopes: SourcingAgentRagSourceScope[];
  };
}

export interface SourcingAgentRagMatch {
  document: SourcingAgentRagDocument;
  score: number;
  snippet: string;
}

export interface SourcingAgentRagQueryResult {
  answer: string;
  contexts: SourcingAgentRagMatch[];
  suggestedFilter: SourcingAgentRagSuggestedFilter | null;
}

const MAX_DOCUMENTS = 800;
const MAX_RECOMMENDATION_DOCUMENTS = 160;
const MAX_KEYWORD_DOCUMENTS = 260;
const MAX_INTEREST_DOCUMENTS = 540;

const FILTER_RULES: Array<{ filter: SourcingAgentRagSuggestedFilter; tokens: string[] }> = [
  { filter: 'selected', tokens: ['선택', '고른', '골라둔'] },
  { filter: 'selling', tokens: ['판매', '잘팔', '잘 팔', '반응', '수요'] },
  { filter: 'strong', tokens: ['a급', 'b급', '고점수', '좋은', '추천'] },
  { filter: 'new', tokens: ['신상', '신상품', '신규', '3일'] },
  { filter: 'wholesale', tokens: ['1688', '도매', '거래처', '공급', '배송'] },
  { filter: 'all', tokens: ['전체', '리셋', '원래'] },
];

export function buildSourcingAgentRagIndex(input: {
  snapshots: SourcingAgentRagSourceSnapshot[];
}): SourcingAgentRagIndex {
  const documents = input.snapshots.flatMap((snapshot) => {
    if (snapshot.scope === 'interest_tracking') return buildInterestDocuments(snapshot);
    if (snapshot.scope === 'today_recommendations') return buildRecommendationDocuments(snapshot);
    return buildKeywordAnalysisDocuments(snapshot);
  });
  const deduped = dedupeDocuments(documents).slice(0, MAX_DOCUMENTS);
  const sourceScopes = Array.from(new Set(input.snapshots.map((snapshot) => snapshot.scope)));

  return {
    documents: deduped,
    stats: {
      documentCount: deduped.length,
      sourceSnapshotCount: input.snapshots.length,
      sourceScopes,
    },
  };
}

export function retrieveSourcingAgentRag(input: {
  index: SourcingAgentRagIndex;
  query: string;
  topK?: number;
}): SourcingAgentRagMatch[] {
  const query = input.query.trim();
  if (!query) return [];

  const topK = Math.max(1, Math.min(12, input.topK ?? 6));
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  return input.index.documents
    .map((document) => ({
      document,
      score: scoreDocument(document, query, queryTokens),
      snippet: buildSnippet(document.text, queryTokens),
    }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export function buildSourcingAgentRagAnswer(input: {
  query: string;
  contexts: SourcingAgentRagMatch[];
  index: SourcingAgentRagIndex;
}): SourcingAgentRagQueryResult {
  const suggestedFilter = resolveSuggestedFilter(input.query);
  if (input.contexts.length === 0) {
    return {
      answer: `아직 "${input.query}"와 직접 맞는 근거가 RAG에 적게 잡혔어요. 현재 인덱스에는 ${input.index.stats.documentCount}개 문서가 있고, 소싱 설정/추천 상품/키워드 분석을 먼저 저장하면 답이 더 좋아집니다.`,
      contexts: [],
      suggestedFilter,
    };
  }

  const top = input.contexts.slice(0, 3);
  const sourceSummary = top
    .map((match, index) => `${index + 1}. ${match.document.title}`)
    .join(' / ');
  const answer = [
    suggestedFilter ? `왼쪽 결과는 "${filterLabel(suggestedFilter)}" 기준으로 볼 수 있어요.` : '관련 근거를 RAG에서 찾았어요.',
    `가장 가까운 근거는 ${sourceSummary} 입니다.`,
    summarizeTopContext(top[0]),
  ].join(' ');

  return {
    answer,
    contexts: input.contexts,
    suggestedFilter,
  };
}

export function isSourcingAgentRagIndexPayload(value: unknown): value is {
  version: 1;
  result: SourcingAgentRagIndex;
  meta: { generatedAt: string };
} {
  if (!isRecord(value)) return false;
  if (value.version !== SOURCING_AGENT_RAG_INDEX_VERSION) return false;
  const result = recordValue(value.result);
  const meta = recordValue(value.meta);
  return Boolean(result && meta && Array.isArray(result.documents) && recordValue(result.stats) && stringValue(meta.generatedAt));
}

function buildInterestDocuments(snapshot: SourcingAgentRagSourceSnapshot): SourcingAgentRagDocument[] {
  const result = recordValue(snapshot.payload.result);
  if (!result) return [];

  const targets = recordsValue(result.targets).slice(0, MAX_INTEREST_DOCUMENTS);
  const observations = recordsValue(result.observations);
  const observationsByTarget = new Map<string, Record<string, unknown>[]>();
  for (const observation of observations) {
    const targetId = stringValue(observation.targetId);
    if (!targetId) continue;
    const current = observationsByTarget.get(targetId) ?? [];
    current.push(observation);
    observationsByTarget.set(targetId, current);
  }

  return targets.map((target, index) => {
    const id = stringValue(target.id) ?? `interest:${index}`;
    const label = firstString(target, ['label', 'keyword', 'category', 'productName']) ?? id;
    const type = stringValue(target.type) ?? 'target';
    const source = stringValue(target.source) ?? 'manual';
    const latestObservation = observationsByTarget.get(id)?.[0] ?? null;
    const metrics = recordValue(latestObservation?.metrics);
    const metricText = metricsToText(metrics);
    const tags = compactStrings([
      label,
      type,
      source,
      stringValue(target.keyword),
      stringValue(target.category),
      stringValue(target.productName),
    ]);

    return {
      id: `${snapshot.scope}:${snapshot.id}:target:${stableId(id)}`,
      sourceScope: snapshot.scope,
      sourceSnapshotId: snapshot.id,
      sourceDate: snapshot.businessDate,
      kind: 'interest',
      title: `관심 ${typeLabel(type)}: ${label}`,
      text: compactSentences([
        `관심 ${typeLabel(type)} ${label}.`,
        `등록 출처 ${source}.`,
        stringValue(target.category) ? `카테고리 ${stringValue(target.category)}.` : null,
        stringValue(target.keyword) ? `키워드 ${stringValue(target.keyword)}.` : null,
        stringValue(target.productName) ? `관심 상품 ${stringValue(target.productName)}.` : null,
        metricText ? `최근 관측 지표: ${metricText}.` : null,
      ]),
      tags,
      metadata: {
        targetId: id,
        type,
        source,
      },
    };
  });
}

function buildRecommendationDocuments(snapshot: SourcingAgentRagSourceSnapshot): SourcingAgentRagDocument[] {
  const result = recordValue(snapshot.payload.result);
  const rows = recordsValue(result?.rows).slice(0, MAX_RECOMMENDATION_DOCUMENTS);

  return rows.map((row, index) => {
    const productName = firstString(row, ['productName', 'name', 'title']) ?? `추천 상품 ${index + 1}`;
    const primaryKeyword = stringValue(row.primaryKeyword) ?? stringValue(row.keyword);
    const grade = stringValue(row.grade);
    const score = numberValue(row.score);
    const reasons = stringsValue(row.reasons);
    const risks = stringsValue(row.risks);
    const keywords = stringsValue(row.keywords);
    const tags = compactStrings([primaryKeyword, grade, ...keywords, ...reasons.slice(0, 3)]);

    return {
      id: `${snapshot.scope}:${snapshot.id}:product:${stableId([
        stringValue(row.productId),
        stringValue(row.itemId),
        stringValue(row.vendorItemId),
        productName,
      ].filter(Boolean).join(':'))}`,
      sourceScope: snapshot.scope,
      sourceSnapshotId: snapshot.id,
      sourceDate: snapshot.businessDate,
      kind: 'recommendation',
      title: productName,
      text: compactSentences([
        `쿠팡 추천 후보 ${productName}.`,
        primaryKeyword ? `대표 키워드 ${primaryKeyword}.` : null,
        keywords.length > 0 ? `연관 키워드 ${keywords.join(', ')}.` : null,
        grade ? `등급 ${grade}.` : null,
        score != null ? `소싱 점수 ${score}점.` : null,
        metricSentence('최근 3일 판매', row.salesLast3d, '개'),
        metricSentence('최근 28일 판매', row.salesLast28d, '개'),
        metricSentence('리뷰', row.ratingCount, '개'),
        metricSentence('쿠팡가', row.salePrice, '원'),
        reasons.length > 0 ? `추천 이유: ${reasons.join(', ')}.` : null,
        risks.length > 0 ? `주의 리스크: ${risks.join(', ')}.` : null,
      ]),
      tags,
      metadata: {
        productId: stringValue(row.productId),
        itemId: stringValue(row.itemId),
        vendorItemId: stringValue(row.vendorItemId),
        grade,
        score,
        salesLast3d: numberValue(row.salesLast3d),
        salesLast28d: numberValue(row.salesLast28d),
        ratingCount: numberValue(row.ratingCount),
        salePrice: numberValue(row.salePrice),
      },
    };
  });
}

function buildKeywordAnalysisDocuments(snapshot: SourcingAgentRagSourceSnapshot): SourcingAgentRagDocument[] {
  const result = recordValue(snapshot.payload.result);
  if (!result) return [];

  return [
    ...buildBoardRankDocuments(snapshot, recordsValue(result.boards)),
    ...buildKeywordListDocuments(snapshot, 'trend', '트렌드 키워드', recordsValue(result.trendItems), MAX_KEYWORD_DOCUMENTS),
    ...buildKeywordListDocuments(snapshot, 'keyword', '검색광고 연관어', recordsValue(result.searchAdRelatedItems), 80),
    ...buildKeywordListDocuments(snapshot, 'keyword', '데이터랩 연관어', recordsValue(result.relatedSearchItems), 80),
    ...buildKeywordListDocuments(snapshot, 'keyword', '쿠팡 키워드', recordsValue(result.coupangKeywordItems), 80),
    ...buildKeywordListDocuments(snapshot, 'keyword', '쿠팡 상품명 토큰', recordsValue(result.coupangProductNameTokens), 80),
    ...buildTrendAgentDocuments(snapshot, recordValue(result.trendAgentResult)),
  ].slice(0, MAX_KEYWORD_DOCUMENTS);
}

function buildBoardRankDocuments(
  snapshot: SourcingAgentRagSourceSnapshot,
  boards: Record<string, unknown>[],
): SourcingAgentRagDocument[] {
  return boards.flatMap((board, boardIndex) => {
    const boardTitle = firstString(board, ['title', 'label', 'name', 'boardName', 'categoryName']) ?? `키워드 보드 ${boardIndex + 1}`;
    const ranks = recordsValue(board.ranks).slice(0, 20);
    return ranks.map((rank, rankIndex) => {
      const keyword = firstString(rank, ['keyword', 'name', 'label', 'title']) ?? `키워드 ${rankIndex + 1}`;
      const rankNumber = numberValue(rank.rank) ?? rankIndex + 1;
      return {
        id: `${snapshot.scope}:${snapshot.id}:board:${stableId(boardTitle)}:${stableId(keyword)}`,
        sourceScope: snapshot.scope,
        sourceSnapshotId: snapshot.id,
        sourceDate: snapshot.businessDate,
        kind: 'keyword' as const,
        title: `${boardTitle} ${rankNumber}위: ${keyword}`,
        text: compactSentences([
          `키워드 분석 보드 ${boardTitle}.`,
          `${keyword}는 ${rankNumber}위 키워드.`,
          metricSentence('검색량', rank.searchVolume),
          metricSentence('클릭량', rank.clicks),
          metricSentence('전환/반응 점수', rank.score),
        ]),
        tags: compactStrings([keyword, boardTitle]),
        metadata: {
          keyword,
          boardTitle,
          rank: rankNumber,
        },
      };
    });
  });
}

function buildKeywordListDocuments(
  snapshot: SourcingAgentRagSourceSnapshot,
  kind: 'keyword' | 'trend',
  label: string,
  items: Record<string, unknown>[],
  limit: number,
): SourcingAgentRagDocument[] {
  return items.slice(0, limit).map((item, index) => {
    const keyword = firstString(item, ['keyword', 'name', 'label', 'title', 'query']) ?? `${label} ${index + 1}`;
    const score = numberValue(item.score) ?? numberValue(item.ratio) ?? numberValue(item.latestRatio);
    const count = numberValue(item.count) ?? numberValue(item.monthlySearchCount) ?? numberValue(item.searchVolume);
    const trendDelta = numberValue(item.trendDelta) ?? numberValue(item.delta);

    return {
      id: `${snapshot.scope}:${snapshot.id}:${label}:${stableId(keyword)}:${index}`,
      sourceScope: snapshot.scope,
      sourceSnapshotId: snapshot.id,
      sourceDate: snapshot.businessDate,
      kind,
      title: `${label}: ${keyword}`,
      text: compactSentences([
        `${label} ${keyword}.`,
        score != null ? `점수/지수 ${score}.` : null,
        count != null ? `수량/검색량 ${count}.` : null,
        trendDelta != null ? `트렌드 변화 ${trendDelta}.` : null,
        stringValue(item.source) ? `출처 ${stringValue(item.source)}.` : null,
      ]),
      tags: compactStrings([keyword, label, stringValue(item.source)]),
      metadata: {
        keyword,
        score,
        count,
        trendDelta,
      },
    };
  });
}

function buildTrendAgentDocuments(
  snapshot: SourcingAgentRagSourceSnapshot,
  trendAgentResult: Record<string, unknown> | null,
): SourcingAgentRagDocument[] {
  const candidates = recordsValue(trendAgentResult?.candidates).slice(0, 80);
  return candidates.map((candidate, index) => {
    const keyword = firstString(candidate, ['keyword', 'name', 'label']) ?? `에이전트 후보 ${index + 1}`;
    const grade = stringValue(candidate.grade);
    const reasons = stringsValue(candidate.reasons);
    return {
      id: `${snapshot.scope}:${snapshot.id}:trend-agent:${stableId(keyword)}:${index}`,
      sourceScope: snapshot.scope,
      sourceSnapshotId: snapshot.id,
      sourceDate: snapshot.businessDate,
      kind: 'agent',
      title: `키워드 에이전트 후보: ${keyword}`,
      text: compactSentences([
        `키워드 에이전트가 ${keyword}를 후보로 판단.`,
        grade ? `등급 ${grade}.` : null,
        metricSentence('점수', candidate.score, '점'),
        metricSentence('트렌드 변화', candidate.trendDelta),
        reasons.length > 0 ? `이유: ${reasons.join(', ')}.` : null,
      ]),
      tags: compactStrings([keyword, grade, ...reasons.slice(0, 3)]),
      metadata: {
        keyword,
        grade,
        score: numberValue(candidate.score),
      },
    };
  });
}

function scoreDocument(document: SourcingAgentRagDocument, query: string, queryTokens: string[]): number {
  const fullText = `${document.title} ${document.tags.join(' ')} ${document.text}`.toLowerCase();
  const titleText = document.title.toLowerCase();
  const tagText = document.tags.join(' ').toLowerCase();
  const normalizedQuery = query.toLowerCase();
  let score = fullText.includes(normalizedQuery) ? 12 : 0;

  for (const token of queryTokens) {
    if (token.length < 2) continue;
    if (titleText.includes(token)) score += 6;
    if (tagText.includes(token)) score += 4;
    if (fullText.includes(token)) score += 1 + Math.min(4, countOccurrences(fullText, token));
  }

  if (document.kind === 'recommendation' && hasAny(query, ['상품', '판매', '쿠팡', '후보'])) score += 3;
  if (document.kind === 'interest' && hasAny(query, ['관심', '기준', '설정', '카테고리', '키워드'])) score += 3;
  if ((document.kind === 'keyword' || document.kind === 'trend') && hasAny(query, ['트렌드', '랭킹', '키워드'])) score += 3;

  return score;
}

function buildSnippet(text: string, queryTokens: string[]): string {
  const lower = text.toLowerCase();
  const firstHit = queryTokens
    .map((token) => lower.indexOf(token))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, firstHit - 60);
  const snippet = text.slice(start, start + 240);
  return start > 0 ? `...${snippet}` : snippet;
}

function resolveSuggestedFilter(query: string): SourcingAgentRagSuggestedFilter | null {
  const normalized = query.replace(/\s+/g, '').toLowerCase();
  for (const rule of FILTER_RULES) {
    if (rule.tokens.some((token) => normalized.includes(token.replace(/\s+/g, '').toLowerCase()))) {
      return rule.filter;
    }
  }
  return null;
}

function summarizeTopContext(match: SourcingAgentRagMatch): string {
  if (match.document.kind === 'recommendation') {
    return `이 상품 근거에는 ${match.snippet}`;
  }
  if (match.document.kind === 'interest') {
    return `현재 설정/관심 기준 근거에는 ${match.snippet}`;
  }
  return `키워드/트렌드 근거에는 ${match.snippet}`;
}

function filterLabel(filter: SourcingAgentRagSuggestedFilter): string {
  if (filter === 'selected') return '선택한 상품';
  if (filter === 'selling') return '판매 반응';
  if (filter === 'strong') return 'A/B급 고점수';
  if (filter === 'new') return '신상품';
  if (filter === 'wholesale') return '1688/공급 조건';
  return '전체 상품';
}

function tokenize(value: string): string[] {
  const normalized = value.normalize('NFKC').toLowerCase();
  const baseTokens = normalized.match(/[\p{Script=Hangul}\p{Script=Han}a-z0-9]+/gu) ?? [];
  const expanded = new Set<string>();

  for (const token of baseTokens) {
    if (token.length < 2) continue;
    expanded.add(token);
    if (token.length >= 3) {
      for (let i = 0; i <= token.length - 2; i += 1) expanded.add(token.slice(i, i + 2));
    }
    if (token.length >= 4) {
      for (let i = 0; i <= token.length - 3; i += 1) expanded.add(token.slice(i, i + 3));
    }
  }

  return [...expanded];
}

function dedupeDocuments(documents: SourcingAgentRagDocument[]): SourcingAgentRagDocument[] {
  const seen = new Set<string>();
  const result: SourcingAgentRagDocument[] = [];
  for (const document of documents) {
    const key = `${document.kind}:${document.title}:${document.sourceScope}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(document);
  }
  return result;
}

function countOccurrences(text: string, needle: string): number {
  let count = 0;
  let index = text.indexOf(needle);
  while (index >= 0) {
    count += 1;
    index = text.indexOf(needle, index + needle.length);
  }
  return count;
}

function hasAny(value: string, needles: string[]): boolean {
  const normalized = value.replace(/\s+/g, '').toLowerCase();
  return needles.some((needle) => normalized.includes(needle.replace(/\s+/g, '').toLowerCase()));
}

function metricsToText(metrics: Record<string, unknown> | null): string | null {
  if (!metrics) return null;
  const entries = Object.entries(metrics)
    .filter(([, value]) => typeof value === 'number' || typeof value === 'string')
    .slice(0, 8)
    .map(([key, value]) => `${key} ${value}`);
  return entries.length > 0 ? entries.join(', ') : null;
}

function metricSentence(label: string, value: unknown, suffix = ''): string | null {
  const numeric = numberValue(value);
  if (numeric == null) return null;
  return `${label} ${numeric}${suffix}.`;
}

function compactSentences(values: Array<string | null | undefined>): string {
  return values.filter((value): value is string => Boolean(value && value.trim())).join(' ');
}

function compactStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim()))));
}

function typeLabel(type: string): string {
  if (type === 'keyword') return '키워드';
  if (type === 'category') return '카테고리';
  if (type === 'product') return '상품';
  return type;
}

function stableId(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^0-9a-z가-힣一-龥]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'unknown';
}

function firstString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = stringValue(record[key]);
    if (value) return value;
  }
  return null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringsValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function recordsValue(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(isRecord)
    : [];
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
