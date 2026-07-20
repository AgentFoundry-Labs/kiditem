export interface StationeryToyTrendSeed {
  keyword: string;
  keywordCn: string;
}

/**
 * 사용자 시드가 없어도 문구·완구 시장의 기본 수집 범위를 유지하는 카테고리 시드.
 * keywordCn 은 1688 검색에, keyword 는 국내 검색·숏폼 분류에 사용한다.
 */
export const DEFAULT_STATIONERY_TOY_TREND_SEEDS: readonly StationeryToyTrendSeed[] = [
  { keyword: '문구', keywordCn: '文具' },
  { keyword: '필통', keywordCn: '儿童笔袋' },
  { keyword: '스티커', keywordCn: '儿童贴纸' },
  { keyword: '다꾸', keywordCn: '手账素材' },
  { keyword: '만들기 키트', keywordCn: '儿童手工材料包' },
  { keyword: '완구', keywordCn: '儿童玩具' },
  { keyword: '인형', keywordCn: '毛绒玩具' },
  { keyword: '블록', keywordCn: '儿童积木' },
  { keyword: '슬라임', keywordCn: '史莱姆水晶泥' },
  { keyword: '스퀴시', keywordCn: '捏捏乐解压玩具' },
];

/**
 * 도우인(중국 SNS)에서 유행하는 완구·문구 키워드 큐레이션 세트.
 * ⚠️ 라이브 도우인 피드가 아니라 수동 유지 목록이다(도우인 원본 데이터는 유료/차단이라
 * 무료로 붙일 수 있는 현실적 대안 — [[reference_market_trend_research_tools]] 참고).
 * keywordCn 을 1688 핫셀링 수집에만 추가로 태워 "도우인에서 뜬 → 1688에서 소싱 가능"
 * 신호를 만든다. 트렌드가 바뀌면 이 목록을 갱신한다.
 */
export const DOUYIN_TREND_TOY_STATIONERY_SEEDS: readonly StationeryToyTrendSeed[] = [
  { keyword: '굿즈', keywordCn: '谷子' },
  { keyword: '포카꾸미기', keywordCn: '咕卡' },
  { keyword: '블라인드박스', keywordCn: '盲盒' },
  { keyword: '숫자유화', keywordCn: '数字油画' },
  { keyword: '액체괴물', keywordCn: '起泡胶' },
  { keyword: '자석블록', keywordCn: '磁力片' },
  { keyword: '하마비즈', keywordCn: '拼豆' },
  { keyword: '미니어처', keywordCn: '微缩模型' },
];

/** 1688 핫셀링 스냅샷의 sourceKeyword(=중문 키워드)로 도우인 트렌드 여부를 판별하는 목록. */
export const DOUYIN_TREND_SOURCE_KEYWORDS: readonly string[] =
  DOUYIN_TREND_TOY_STATIONERY_SEEDS.map((seed) => seed.keywordCn);

const DEFAULT_KOREAN_SEED_KEYS = new Set(
  DEFAULT_STATIONERY_TOY_TREND_SEEDS.map((seed) => compact(normalizeText(seed.keyword))),
);

// Korean product nouns are commonly followed by particles or a copula without
// whitespace (`인형을`, `피규어일까요`). Accept only grammatical suffixes so
// unrelated compounds such as `노트북` and `블록체인` stay excluded.
const KOREAN_GRAMMATICAL_SUFFIXES = new Set([
  '은', '는', '이', '가', '을', '를', '의', '에', '에서', '에게', '에게서', '한테',
  '한테서', '으로', '로', '와', '과', '도', '만', '부터', '까지', '처럼',
  '이다', '입니다', '인', '인가', '인가요', '이었다', '였다', '이라', '이라고',
  '이란', '이라면', '일까', '일까요',
]);

interface DomainTermGroup {
  label: string;
  terms: readonly string[];
  requiresProductContext?: boolean;
}

const PRODUCT_CONTEXT_TERMS = [
  '리뷰', '언박싱', '개봉', '신상', '추천', '인기', '유행', '품절', '구매', '샀', '만들',
  '놀이', '조립', '뽑기', '랜덤', '가챠', '비교', '거래', '수집', '컬렉션', 'review',
  'unboxing', 'haul', 'new', 'viral', 'trending', 'diy', 'craft', 'collection', '新品',
  '开箱', '测评', '推荐', '热卖', '爆款', '手工', '拼装', '玩具',
] as const;

// 일반 영상에서 자주 나오는 '키즈', 'DIY', '언박싱' 같은 약한 단어는 제외한다.
// 아래 용어 중 하나가 실제 제목·카테고리에 있어야 문구·완구 영상으로 인정한다.
const DOMAIN_TERM_GROUPS: readonly DomainTermGroup[] = [
  {
    label: '스티커·다꾸',
    terms: [
      '캐릭터 스티커', '다이어리 꾸미기', '스티커', '다꾸', '마스킹테이프', '씰스티커',
      'journaling', 'scrapbook', 'sticker', '手账', '贴纸', '胶带',
    ],
  },
  {
    label: '필기구·학용품',
    terms: [
      '캐릭터 문구', '문구세트', '학용품', '필기구', '필통', '색연필', '사인펜', '네임펜',
      '지우개', '연필', '샤프', '볼펜', '마카', '크레용', 'stationery', 'pencil case',
      'colored pencil', 'highlighter', 'marker pen', 'pencil', 'eraser', 'crayon', '文具',
      '学习用品', '笔袋', '铅笔', '橡皮', '圆珠笔', '记号笔', '彩笔',
    ],
  },
  {
    label: '노트·메모',
    terms: [
      '스케치북', '포스트잇', '메모지', '다이어리', '노트', '공책', 'notepad', 'notebook',
      'memo pad', 'sketchbook', '笔记本', '便签', '素描本',
    ],
  },
  {
    label: '미술·공예',
    terms: [
      '만들기 키트', '공예키트', '미술놀이', '색칠공부', '종이접기', '데코덴', '비즈공예',
      '클레이', '점토', 'craft kit', 'coloring book', 'origami kit', 'bead kit', 'polymer clay',
      '手工材料包', '绘画套装', '涂色本', '折纸', '黏土',
    ],
  },
  {
    label: '블록·조립완구',
    terms: [
      '조립완구', '레고', '블록', 'building blocks', 'building block', 'lego', '积木', '拼装玩具',
    ],
  },
  {
    label: '인형·피규어',
    terms: [
      '봉제인형', '구체관절인형', '피규어', '미니어처', 'plush toy', 'action figure',
      'miniature toy', '毛绒玩具', '手办', '模型玩具',
    ],
  },
  {
    label: '인형·피규어',
    terms: ['인형', 'doll', '娃娃'],
    requiresProductContext: true,
  },
  {
    label: '퍼즐·게임',
    terms: [
      '보드게임', '카드게임', '직소퍼즐', '퍼즐', 'board game', 'card game', 'jigsaw puzzle',
      '拼图', '桌游', '卡牌游戏',
    ],
  },
  {
    label: '촉감·해소완구',
    terms: [
      '촉감놀이', '스트레스볼', '말랑이', '스퀴시', '슬라임', '팝잇', 'fidget toy',
      'stress ball', 'squishy toy', 'squishy', 'slime', '解压玩具', '捏捏乐', '史莱姆',
      '水晶泥', '慢回弹',
    ],
  },
  {
    label: '역할놀이',
    terms: [
      '역할놀이', '소꿉놀이', '주방놀이', '병원놀이', 'playset', 'pretend play', '过家家',
      '厨房玩具', '医生玩具',
    ],
  },
  {
    label: '완구',
    terms: [
      '어린이 장난감', '유아 장난감', '캐릭터 완구', '교육완구', '완구', '장난감', '토이',
      'blind box', 'toy set', 'kids toy', 'toy', '盲盒', '儿童玩具', '益智玩具', '玩具',
    ],
  },
  {
    label: '문구',
    terms: ['문구류', '문구', 'office supplies'],
  },
];

export function matchStationeryToyTrend(
  textParts: ReadonlyArray<string | null | undefined>,
  seedKeywords: readonly string[] = [],
): string | null {
  const text = normalizeText(textParts.filter(isPresent).join(' '));
  if (!text) return null;

  for (const seed of uniqueNonEmpty(seedKeywords)) {
    if (DEFAULT_KOREAN_SEED_KEYS.has(compact(normalizeText(seed)))) continue;
    if (containsTerm(text, normalizeText(seed))) return seed;
  }

  for (const group of DOMAIN_TERM_GROUPS) {
    const matched = group.terms.some((term) => containsTerm(text, normalizeText(term)));
    if (!matched) continue;
    if (group.requiresProductContext && !hasProductContext(text)) continue;
    return group.label;
  }
  return null;
}

export function isStationeryToyTrend(
  textParts: ReadonlyArray<string | null | undefined>,
  seedKeywords: readonly string[] = [],
): boolean {
  return matchStationeryToyTrend(textParts, seedKeywords) != null;
}

function containsTerm(text: string, term: string): boolean {
  if (!term) return false;
  if (/^[a-z0-9 ]+$/.test(term)) {
    const pattern = term
      .split(/\s+/)
      .map(escapeRegExp)
      .join('[^a-z0-9]+');
    return new RegExp(`(?:^|[^a-z0-9])${pattern}(?:$|[^a-z0-9])`, 'i').test(text);
  }
  if (/^[가-힣 ]+$/.test(term)) {
    const pattern = term
      .split(/\s+/)
      .map(escapeRegExp)
      .join('[^가-힣]+');
    const matcher = new RegExp(`(?:^|[^가-힣])${pattern}`, 'g');
    let match: RegExpExecArray | null;
    while ((match = matcher.exec(text)) != null) {
      const suffix = /^[가-힣]+/.exec(text.slice(match.index + match[0].length))?.[0] ?? '';
      if (!suffix || KOREAN_GRAMMATICAL_SUFFIXES.has(suffix)) return true;
    }
    return false;
  }
  return compact(text).includes(compact(term));
}

function hasProductContext(text: string): boolean {
  return PRODUCT_CONTEXT_TERMS.some((term) => {
    const normalized = normalizeText(term);
    if (/^[가-힣]+$/.test(normalized)) return compact(text).includes(compact(normalized));
    return containsTerm(text, normalized);
  });
}

function normalizeText(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function compact(value: string): string {
  return value.replace(/[^a-z0-9가-힣\u4e00-\u9fff]+/gi, '');
}

function uniqueNonEmpty(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function isPresent(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
