export interface CrossMarketChinaSignal {
  offerId: string;
  sourceKeyword: string;
  title: string | null;
  monthlySales: number | null;
}

export interface CrossMarketGlobalSignal {
  videoKey: string;
  keyword: string | null;
  title: string | null;
  viewCount: number | null;
}

export interface CrossMarketKoreaSignal {
  id: string;
  keyword: string;
  monthlySearches: number | null;
  rightsCheckRequired?: boolean;
}

export interface CrossMarketTopicOpportunity {
  id: string;
  label: string;
  chinaOfferCount: number;
  chinaTopTradeSignal: number | null;
  globalVideoCount: number;
  globalTotalViews: number | null;
  koreaKeywordCount: number;
  koreaTopMonthlySearches: number | null;
  confirmedStageCount: number;
  rightsCheckRequired: boolean;
  nextAction: string;
}

interface TopicRule {
  id: string;
  label: string;
  terms: readonly string[];
}

interface TopicAggregate {
  id: string;
  label: string;
  chinaIds: Set<string>;
  chinaTradeSignals: number[];
  globalIds: Set<string>;
  globalViews: number[];
  koreaIds: Set<string>;
  koreaSearches: number[];
  rightsCheckRequired: boolean;
}

const TOPIC_RULES: readonly TopicRule[] = [
  {
    id: 'sticker-journaling',
    label: '스티커·다꾸',
    terms: ['스티커', '다꾸', '마스킹테이프', '씰', '手账', '贴纸', '胶带', 'sticker', 'journaling'],
  },
  {
    id: 'writing-school',
    label: '필기구·학용품',
    terms: ['필통', '학용품', '필기구', '연필', '펜', '지우개', '문구', '笔袋', '文具', '铅笔', '橡皮', 'stationery'],
  },
  {
    id: 'note-memo',
    label: '노트·메모',
    terms: ['노트', '메모', '다이어리', '공책', '포스트잇', '笔记本', '便签', 'notebook', 'notepad'],
  },
  {
    id: 'art-craft',
    label: '미술·공예',
    terms: ['만들기', '공예', '색칠', '종이접기', '비즈', '클레이', '手工', '绘画', '折纸', '黏土', 'craft', 'origami'],
  },
  {
    id: 'blocks-building',
    label: '블록·조립완구',
    terms: ['블록', '조립', '레고', '积木', '拼装', 'building block', 'lego'],
  },
  {
    id: 'doll-figure',
    label: '인형·피규어',
    terms: ['인형', '피규어', '미니어처', '毛绒', '娃娃', '手办', 'plush', 'figure', 'doll'],
  },
  {
    id: 'puzzle-game',
    label: '퍼즐·게임',
    terms: ['퍼즐', '보드게임', '카드게임', '拼图', '桌游', '卡牌', 'puzzle', 'board game'],
  },
  {
    id: 'sensory-relief',
    label: '촉감·해소완구',
    terms: ['스퀴시', '슬라임', '말랑이', '팝잇', '스트레스볼', '촉감', '捏捏乐', '史莱姆', '水晶泥', '解压', 'squishy', 'slime', 'fidget'],
  },
  {
    id: 'pretend-play',
    label: '역할놀이',
    terms: ['역할놀이', '소꿉놀이', '주방놀이', '병원놀이', '过家家', '厨房玩具', 'playset', 'pretend play'],
  },
  {
    id: 'general-toy',
    label: '완구',
    terms: ['완구', '장난감', '토이', '玩具', 'toy'],
  },
];

/**
 * 서로 다른 플랫폼의 ID를 같은 상품으로 단정하지 않고, 제목·수집 시드에서
 * 확인되는 문구·완구 주제만 묶는다. 반환 수치는 점수가 아니라 실제로 확인된
 * 단계 수와 각 원천의 관찰값이다.
 */
export function buildCrossMarketTopics(input: {
  china: readonly CrossMarketChinaSignal[];
  global: readonly CrossMarketGlobalSignal[];
  korea: readonly CrossMarketKoreaSignal[];
  limit?: number;
}): CrossMarketTopicOpportunity[] {
  const aggregates = new Map<string, TopicAggregate>();

  for (const signal of input.china) {
    const topic = resolveTopic(`${signal.sourceKeyword} ${signal.title ?? ''}`, signal.sourceKeyword);
    const aggregate = ensureAggregate(aggregates, topic);
    aggregate.chinaIds.add(signal.offerId);
    pushFinite(aggregate.chinaTradeSignals, signal.monthlySales);
  }

  for (const signal of input.global) {
    const fallback = signal.keyword?.trim() || signal.title?.trim() || '글로벌 숏폼';
    const topic = resolveTopic(`${signal.keyword ?? ''} ${signal.title ?? ''}`, fallback);
    const aggregate = ensureAggregate(aggregates, topic);
    aggregate.globalIds.add(signal.videoKey);
    pushFinite(aggregate.globalViews, signal.viewCount);
  }

  for (const signal of input.korea) {
    const topic = resolveTopic(signal.keyword, signal.keyword);
    const aggregate = ensureAggregate(aggregates, topic);
    aggregate.koreaIds.add(signal.id);
    pushFinite(aggregate.koreaSearches, signal.monthlySearches);
    aggregate.rightsCheckRequired ||= signal.rightsCheckRequired === true;
  }

  return [...aggregates.values()]
    .map(toOpportunity)
    .sort(compareOpportunity)
    .slice(0, Math.max(1, input.limit ?? 8));
}

function resolveTopic(text: string, fallback: string): Pick<TopicRule, 'id' | 'label'> {
  const normalized = normalize(text);
  const matched = TOPIC_RULES.find((rule) => rule.terms.some((term) => normalized.includes(normalize(term))));
  if (matched) return matched;

  const label = fallback.trim() || '기타 문구·완구';
  return { id: `custom-${compact(label) || 'other'}`, label };
}

function ensureAggregate(
  aggregates: Map<string, TopicAggregate>,
  topic: Pick<TopicRule, 'id' | 'label'>,
): TopicAggregate {
  const existing = aggregates.get(topic.id);
  if (existing) return existing;
  const created: TopicAggregate = {
    id: topic.id,
    label: topic.label,
    chinaIds: new Set(),
    chinaTradeSignals: [],
    globalIds: new Set(),
    globalViews: [],
    koreaIds: new Set(),
    koreaSearches: [],
    rightsCheckRequired: false,
  };
  aggregates.set(topic.id, created);
  return created;
}

function toOpportunity(aggregate: TopicAggregate): CrossMarketTopicOpportunity {
  const chinaOfferCount = aggregate.chinaIds.size;
  const globalVideoCount = aggregate.globalIds.size;
  const koreaKeywordCount = aggregate.koreaIds.size;
  const confirmedStageCount = [chinaOfferCount, globalVideoCount, koreaKeywordCount].filter(
    (count) => count > 0,
  ).length;

  return {
    id: aggregate.id,
    label: aggregate.label,
    chinaOfferCount,
    chinaTopTradeSignal: maxOrNull(aggregate.chinaTradeSignals),
    globalVideoCount,
    globalTotalViews: sumOrNull(aggregate.globalViews),
    koreaKeywordCount,
    koreaTopMonthlySearches: maxOrNull(aggregate.koreaSearches),
    confirmedStageCount,
    rightsCheckRequired: aggregate.rightsCheckRequired,
    nextAction: aggregate.rightsCheckRequired
      ? '권리 확인 후 검증'
      : nextActionFor({ chinaOfferCount, globalVideoCount, koreaKeywordCount }),
  };
}

function nextActionFor(input: {
  chinaOfferCount: number;
  globalVideoCount: number;
  koreaKeywordCount: number;
}): string {
  const hasChina = input.chinaOfferCount > 0;
  const hasGlobal = input.globalVideoCount > 0;
  const hasKorea = input.koreaKeywordCount > 0;
  if (hasChina && hasGlobal && hasKorea) return '소량 검증 후보';
  if (hasChina && hasGlobal) return '한국 수요 확인';
  if (hasChina && hasKorea) return '글로벌 반응 확인';
  if (hasGlobal && hasKorea) return '1688 공급 확인';
  if (hasChina) return '글로벌 반응 확인';
  if (hasGlobal) return '한국 수요 확인';
  return '중국 공급 확인';
}

function compareOpportunity(a: CrossMarketTopicOpportunity, b: CrossMarketTopicOpportunity): number {
  return (
    b.confirmedStageCount - a.confirmedStageCount
    || (b.koreaTopMonthlySearches ?? 0) - (a.koreaTopMonthlySearches ?? 0)
    || (b.globalTotalViews ?? 0) - (a.globalTotalViews ?? 0)
    || (b.chinaTopTradeSignal ?? 0) - (a.chinaTopTradeSignal ?? 0)
    || a.label.localeCompare(b.label, 'ko-KR')
  );
}

function pushFinite(target: number[], value: number | null): void {
  if (value !== null && Number.isFinite(value) && value >= 0) target.push(value);
}

function maxOrNull(values: number[]): number | null {
  return values.length > 0 ? Math.max(...values) : null;
}

function sumOrNull(values: number[]): number | null {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : null;
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g, ' ').trim();
}

function compact(value: string): string {
  return normalize(value).replace(/[^a-z0-9가-힣\u4e00-\u9fff]+/gi, '');
}
