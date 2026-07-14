export interface RepresentativeKeywordProduct {
  vendorItemId: string;
  productName: string;
  /** 쿠팡 카탈로그 또는 Wing 응답에서 확인한 카테고리 경로. */
  category: string | null;
}

export type AutomaticKeywordOrigin = "coupang_category" | "product_name";
export type RepresentativeKeywordSource =
  "manual_override" | "wing_performance" | AutomaticKeywordOrigin;

export interface RepresentativeKeywordPerformance {
  vendorItemId: string;
  keyword: string;
  salesRank: number | null;
  keywordSalesLast28d: number | null;
  keywordViewsLast28d: number | null;
  keywordConversionRate28d: number | null;
}

export interface RepresentativeKeywordCandidate {
  keyword: string;
  origin: AutomaticKeywordOrigin;
  /** Wing 수집 전에는 null, 수집 후 0~100. 판매 50%·조회 30%·전환 20%. */
  score: number | null;
  salesRank: number | null;
  keywordSalesLast28d: number | null;
  keywordViewsLast28d: number | null;
  keywordConversionRate28d: number | null;
  observed: boolean;
}

export interface RepresentativeKeywordAssignment extends RepresentativeKeywordProduct {
  keyword: string;
  source: RepresentativeKeywordSource;
  score: number | null;
  recommendationReason: string;
  automaticKeyword: string;
  candidates: RepresentativeKeywordCandidate[];
}

export interface RepresentativeKeywordSearchAssignment extends RepresentativeKeywordProduct {
  keyword: string;
  /** 0 = 현재 자동 대표 후보. 전체 상품의 1차 수집을 먼저 끝내기 위한 우선순위. */
  candidateIndex: number;
}

const PRODUCT_KEYWORD_PATTERNS: ReadonlyArray<
  [pattern: string, keyword: string]
> = [
  ["보드게임", "보드게임"],
  ["문구세트", "문구세트"],
  ["학용품세트", "학용품세트"],
  ["색칠놀이", "색칠놀이"],
  ["스티커북", "스티커북"],
  ["만들기키트", "만들기 키트"],
  ["슬라임", "슬라임"],
  ["액체괴물", "슬라임"],
  ["스퀴시", "스퀴시"],
  ["말랑이", "말랑이"],
  ["퍼즐", "퍼즐"],
  ["블록", "블록"],
  ["레고", "블록"],
  ["인형", "인형"],
  ["피규어", "피규어"],
  ["미니카", "미니카"],
  ["자동차", "자동차 장난감"],
  ["로봇", "로봇 장난감"],
  ["클레이", "클레이"],
  ["점토", "점토"],
  ["비즈", "비즈 공예"],
  ["스티커", "스티커"],
  ["다꾸", "다꾸"],
  ["색연필", "색연필"],
  ["사인펜", "사인펜"],
  ["싸인펜", "사인펜"],
  ["크레파스", "크레파스"],
  ["마카", "마카"],
  ["필통", "필통"],
  ["연필", "연필"],
  ["샤프", "샤프"],
  ["볼펜", "볼펜"],
  ["지우개", "지우개"],
  ["가위", "가위"],
  ["테이프", "테이프"],
  ["메모지", "메모지"],
  ["수첩", "수첩"],
  ["공책", "공책"],
  ["노트", "노트"],
  ["파일", "파일"],
  ["파우치", "파우치"],
  ["물병", "물병"],
  ["텀블러", "텀블러"],
];

const STOP_WORDS = new Set([
  "키드아이템",
  "해피프렌즈",
  "ky",
  "ind",
  "in",
  "inch",
  "cm",
  "mm",
  "ml",
  "kg",
  "pcs",
  "pc",
  "pack",
  "box",
  "set",
  "랜덤",
  "랜덤발송",
  "혼합",
  "혼합색상",
  "색상",
  "컬러",
  "옵션",
  "상세페이지",
  "참조",
  "무료배송",
  "로켓배송",
  "판매자배송",
  "세트",
  "개입",
  "낱개",
  "대용량",
  "소형",
  "중형",
  "대형",
  "모음",
  "종류",
  "선택",
  "국내",
  "정품",
  "상품",
]);

const GENERIC_CATEGORIES = new Set([
  "전체",
  "기타",
  "문구",
  "완구",
  "문구완구",
  "생활용품",
  "홈인테리어",
]);

const PRODUCT_SUFFIXES = [
  "랜덤발송",
  "혼합색상",
  "세트",
  "개입",
  "묶음",
  "패키지",
  "모음",
  "종류",
];

/** 쿠팡 카테고리 leaf/parent와 상품명 핵심어에서 상품당 최대 3개 후보를 만든다. */
export function buildRepresentativeKeywordCandidates(
  product: RepresentativeKeywordProduct,
): Array<
  Omit<
    RepresentativeKeywordCandidate,
    | "score"
    | "salesRank"
    | "keywordSalesLast28d"
    | "keywordViewsLast28d"
    | "keywordConversionRate28d"
    | "observed"
  >
> {
  const candidates: Array<{ keyword: string; origin: AutomaticKeywordOrigin }> =
    [];
  const add = (keyword: string, origin: AutomaticKeywordOrigin) => {
    const normalized = keyword.trim().replace(/\s+/g, " ");
    if (
      normalized.length < 2 ||
      candidates.some((candidate) => candidate.keyword === normalized)
    ) {
      return;
    }
    candidates.push({ keyword: normalized, origin });
  };

  const categorySegments = splitCategory(product.category);
  const specificCategories = [...categorySegments]
    .reverse()
    .filter((segment) => !GENERIC_CATEGORIES.has(compactKeyword(segment)));
  if (specificCategories[0]) add(specificCategories[0], "coupang_category");

  const compactName = compactKeyword(product.productName);
  const matchedPattern = PRODUCT_KEYWORD_PATTERNS.find(([pattern]) =>
    compactName.includes(pattern),
  );
  if (matchedPattern) add(matchedPattern[1], "product_name");

  for (const token of tokenizeProductName(product.productName)) {
    add(token, "product_name");
    if (candidates.length >= 3) break;
  }

  for (const category of specificCategories.slice(1)) {
    add(category, "coupang_category");
    if (candidates.length >= 3) break;
  }

  if (candidates.length === 0) {
    const fallback = categorySegments.at(-1) ?? "문구 완구";
    add(
      fallback,
      categorySegments.length > 0 ? "coupang_category" : "product_name",
    );
  }
  return candidates.slice(0, 3);
}

/**
 * 후보별 Wing 검색결과 전체 지표를 후보 안에서 정규화해 대표 키워드를 선택한다.
 * 판매량 50% + 조회수 30% + 전환율 20%, 동점이면 자사 상품의 판매순위가 높은 후보를 택한다.
 */
export function buildRepresentativeKeywordAssignments(
  products: RepresentativeKeywordProduct[],
  manualKeywordByVendorItemId: ReadonlyMap<string, string> = new Map(),
  performances: RepresentativeKeywordPerformance[] = [],
): RepresentativeKeywordAssignment[] {
  const performanceByTarget = new Map(
    performances.map((row) => [targetKey(row.vendorItemId, row.keyword), row]),
  );

  return products.map((product) => {
    const baseCandidates = buildRepresentativeKeywordCandidates(product);
    const observed = baseCandidates.map((candidate) => ({
      ...candidate,
      performance: performanceByTarget.get(
        targetKey(product.vendorItemId, candidate.keyword),
      ),
    }));
    const eligible = observed.filter(
      (candidate) =>
        candidate.performance?.salesRank !== null &&
        candidate.performance !== undefined &&
        hasKeywordMetrics(candidate.performance),
    );
    const maxima = {
      sales: Math.max(
        0,
        ...eligible.map(
          (candidate) => candidate.performance?.keywordSalesLast28d ?? 0,
        ),
      ),
      views: Math.max(
        0,
        ...eligible.map(
          (candidate) => candidate.performance?.keywordViewsLast28d ?? 0,
        ),
      ),
      conversion: Math.max(
        0,
        ...eligible.map(
          (candidate) => candidate.performance?.keywordConversionRate28d ?? 0,
        ),
      ),
    };
    const candidates: RepresentativeKeywordCandidate[] = observed.map(
      ({ performance, ...candidate }) => ({
        ...candidate,
        score:
          performance?.salesRank === null ||
          !performance ||
          !hasKeywordMetrics(performance)
            ? null
            : scorePerformance(performance, maxima),
        salesRank: performance?.salesRank ?? null,
        keywordSalesLast28d: performance?.keywordSalesLast28d ?? null,
        keywordViewsLast28d: performance?.keywordViewsLast28d ?? null,
        keywordConversionRate28d: performance?.keywordConversionRate28d ?? null,
        observed: Boolean(performance),
      }),
    );
    const automatic = [...candidates].sort(compareCandidates)[0];
    const manual = manualKeywordByVendorItemId
      .get(product.vendorItemId)
      ?.trim();

    if (manual) {
      return {
        ...product,
        keyword: manual,
        source: "manual_override",
        score: null,
        recommendationReason: "사용자가 직접 지정한 대표 키워드",
        automaticKeyword: automatic.keyword,
        candidates,
      };
    }

    const hasWingEvidence = automatic.score !== null;
    return {
      ...product,
      keyword: automatic.keyword,
      source: hasWingEvidence ? "wing_performance" : automatic.origin,
      score: automatic.score,
      recommendationReason: hasWingEvidence
        ? "Wing 28일 판매량 50% · 조회수 30% · 전환율 20%"
        : automatic.origin === "coupang_category"
          ? "쿠팡 카테고리명 기준 · Wing 비교 수집 전"
          : "상품명 핵심어 기준 · Wing 비교 수집 전",
      automaticKeyword: automatic.keyword,
      candidates,
    };
  });
}

/** 수집 대상은 직접 지정 상품은 1개, 자동 상품은 후보 최대 3개를 모두 반환한다. */
export function buildRepresentativeKeywordSearchAssignments(
  products: RepresentativeKeywordProduct[],
  manualKeywordByVendorItemId: ReadonlyMap<string, string> = new Map(),
): RepresentativeKeywordSearchAssignment[] {
  return products.flatMap((product) => {
    const manual = manualKeywordByVendorItemId
      .get(product.vendorItemId)
      ?.trim();
    const keywords = manual
      ? [manual]
      : buildRepresentativeKeywordCandidates(product).map(
          (candidate) => candidate.keyword,
        );
    return keywords.map((keyword, candidateIndex) => ({
      ...product,
      keyword,
      candidateIndex,
    }));
  });
}

/** 기존 호출부 호환용 단일 상품명 후보. */
export function deriveKeywordFromName(productName: string): string {
  return buildRepresentativeKeywordCandidates({
    vendorItemId: "",
    productName,
    category: null,
  })[0].keyword;
}

function compareCandidates(
  a: RepresentativeKeywordCandidate,
  b: RepresentativeKeywordCandidate,
): number {
  const aHasScore = a.score !== null;
  const bHasScore = b.score !== null;
  if (aHasScore !== bHasScore) return aHasScore ? -1 : 1;
  return (
    (b.score ?? -1) - (a.score ?? -1) ||
    (a.salesRank ?? Number.MAX_SAFE_INTEGER) -
      (b.salesRank ?? Number.MAX_SAFE_INTEGER) ||
    originPriority(a.origin) - originPriority(b.origin)
  );
}

function originPriority(origin: AutomaticKeywordOrigin): number {
  return origin === "coupang_category" ? 0 : 1;
}

function scorePerformance(
  performance: RepresentativeKeywordPerformance,
  maxima: { sales: number; views: number; conversion: number },
): number {
  const normalized = (value: number | null, max: number) =>
    max > 0 ? Math.max(0, value ?? 0) / max : 0;
  return Math.round(
    100 *
      (normalized(performance.keywordSalesLast28d, maxima.sales) * 0.5 +
        normalized(performance.keywordViewsLast28d, maxima.views) * 0.3 +
        normalized(performance.keywordConversionRate28d, maxima.conversion) *
          0.2),
  );
}

function hasKeywordMetrics(
  performance: RepresentativeKeywordPerformance,
): boolean {
  return (
    performance.keywordSalesLast28d !== null ||
    performance.keywordViewsLast28d !== null ||
    performance.keywordConversionRate28d !== null
  );
}

function splitCategory(category: string | null): string[] {
  if (!category) return [];
  return category
    .split(/\s*(?:>|\/|\||›|≫)\s*/)
    .map((segment) =>
      segment
        .replace(/\([^)]*\)/g, " ")
        .replace(/\[[^\]]*\]/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((segment) => segment.length >= 2);
}

function tokenizeProductName(productName: string): string[] {
  const tokens = productName.match(/[\p{Script=Hangul}A-Za-z]+/gu) ?? [];
  const cleaned = tokens
    .map(cleanProductToken)
    .filter((token): token is string => Boolean(token));
  return [...new Set(cleaned)].sort((a, b) => b.length - a.length);
}

function cleanProductToken(raw: string): string | null {
  let token = raw.toLowerCase();
  for (const suffix of PRODUCT_SUFFIXES) {
    if (token.endsWith(suffix) && token.length > suffix.length + 1) {
      token = token.slice(0, -suffix.length);
    }
  }
  if (token.length < 2 || STOP_WORDS.has(token) || /^[a-z]+$/.test(token)) {
    return null;
  }
  return token;
}

function compactKeyword(value: string): string {
  return value.replace(/[^\p{Script=Hangul}A-Za-z]/gu, "").toLowerCase();
}

function targetKey(vendorItemId: string, keyword: string): string {
  return `${vendorItemId}\u0000${keyword}`;
}
