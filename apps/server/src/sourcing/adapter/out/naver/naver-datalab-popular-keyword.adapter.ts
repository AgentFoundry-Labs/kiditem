import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  NaverDatalabPopularKeywordBoard,
  NaverDatalabPopularKeywordBoardKey,
  NaverDatalabPopularKeywordPort,
  NaverDatalabPopularKeywordRank,
  NaverDatalabTimeUnit,
  SearchNaverDatalabPopularKeywordsInput,
  SearchNaverDatalabPopularKeywordsResult,
} from '../../../application/port/out/provider/naver-keyword-research.port';

const REQUIRED_ENV = ['NAVER_API_HUB_CLIENT_ID', 'NAVER_API_HUB_CLIENT_SECRET'];
const DEFAULT_BASE_URL = 'https://naverapihub.apigw.ntruss.com';
const SHOPPING_KEYWORD_TREND_URI = '/shopping/v1/category/keywords';
const DEFAULT_BOARD_KEYS: NaverDatalabPopularKeywordBoardKey[] = [
  'all_categories',
  'birth_kids',
  'toys_dolls',
  'stationery_office',
  'kids_fashion',
];
const DEFAULT_LIMIT = 20;
// Shopping Insight 는 한 요청에서 최대 5개 키워드 그룹만 비교한다. 그보다 많은 후보는
// 앵커 키워드를 공유하는 여러 배치로 나눠 호출한 뒤 앵커 비율로 재척도해서 합친다.
const MAX_KEYWORDS_PER_REQUEST = 5;
const MAX_LIMIT = 100;
const BATCH_DELAY_MS = 120;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const CACHE_TTL_MS = 10 * 60 * 1000;

interface NaverApiHubConfig {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
}

interface PopularKeywordBoardPreset {
  key: NaverDatalabPopularKeywordBoardKey;
  label: string;
  cid: number;
  categoryPath: string;
  candidates: readonly string[];
}

interface ShoppingInsightKeywordTrendResponse {
  startDate?: string;
  endDate?: string;
  timeUnit?: NaverDatalabTimeUnit;
  results?: Array<{
    title?: string;
    keyword?: string[];
    data?: Array<{
      period?: string;
      ratio?: number;
    }>;
  }>;
}

interface CachedShoppingInsightResponse {
  expiresAt: number;
  value: ShoppingInsightKeywordTrendResponse;
}

// 각 보드의 후보 풀. Shopping Insight 는 "인기검색어 목록" API 가 아니라 "보낸 후보들의
// 상대 클릭비율" API 이므로, 표시 개수(TOP N)는 이 풀 크기가 상한이다. 풀보다 큰 N 을
// 요청하면 응답이 풀 크기에서 멈추고 UI 가 "원천 부족"으로 표기한다.
const BIRTH_KIDS_CANDIDATES = [
  '유아완구', '유아용품', '아기옷', '유아교구', '어린이장난감',
  '기저귀', '물티슈', '분유', '젖병', '유모차',
  '카시트', '아기침대', '아기욕조', '아기띠', '이유식',
  '유아식판', '유아식탁의자', '신생아용품', '유아간식', '턱받이',
] as const;

const BOARD_PRESETS: Record<NaverDatalabPopularKeywordBoardKey, PopularKeywordBoardPreset> = {
  all_categories: {
    key: 'all_categories',
    label: '필터 없음 TOP',
    cid: 50000005,
    categoryPath: '출산/육아 전체 · Shopping Insight 후보 비교',
    candidates: BIRTH_KIDS_CANDIDATES,
  },
  birth_kids: {
    key: 'birth_kids',
    label: '출산/육아',
    cid: 50000005,
    categoryPath: '출산/육아',
    candidates: BIRTH_KIDS_CANDIDATES,
  },
  toys_dolls: {
    key: 'toys_dolls',
    label: '완구/인형',
    cid: 50000142,
    categoryPath: '출산/육아 > 완구/인형',
    candidates: [
      '레고', '포켓몬카드', '캐릭터인형', '역할놀이', '유아블록',
      '인형', '봉제인형', '피규어', '장난감', '어린이장난감',
      '유아완구', '애착인형', '아기인형', '공룡장난감', '자동차장난감',
      '물놀이장난감', '캐릭터장난감', '미니어처', '만들기키트', '보드게임',
    ],
  },
  stationery_office: {
    key: 'stationery_office',
    label: '문구/사무용품',
    cid: 50000158,
    categoryPath: '생활/건강 > 문구/사무용품',
    candidates: [
      '스티커', '다이어리', '필기구', '노트', '학용품',
      '파일', '바인더', '클리어파일', '스테이플러', '가위',
      '풀', '테이프', '계산기', '화이트보드', '포스트잇',
      'A4용지', '서류봉투', '명찰', '문서보관함', '펜꽂이',
    ],
  },
  kids_fashion: {
    key: 'kids_fashion',
    label: '유아동의류',
    cid: 50000138,
    categoryPath: '출산/육아 > 유아동의류',
    candidates: [
      '유아동복', '키즈원피스', '아동상하복', '아동내복', '키즈운동화',
      '아동잠옷', '키즈레깅스', '아동후드티', '키즈맨투맨', '아동패딩',
      '유아점퍼', '아동양말', '키즈모자', '아동수영복', '유아우비',
      '키즈가방', '아동슬리퍼', '아동청바지', '키즈트레이닝복', '유아내의',
    ],
  },
  toys_block: {
    key: 'toys_block',
    label: '블록완구',
    cid: 50001159,
    categoryPath: '완구/인형 > 블록',
    candidates: [
      '레고', '자석블록', '유아블록', '조립블록', '블록완구',
      '원목블록', '대형블록', '자석타일', '맥포머스', '듀플로',
      '레고테크닉', '레고프렌즈', '블록장난감', '구슬블록', '조립완구',
      '건축블록', '아기블록', '블록세트', '퍼즐블록', '자석놀이',
    ],
  },
  toys_action: {
    key: 'toys_action',
    label: '작동완구',
    cid: 50001154,
    categoryPath: '완구/인형 > 작동완구',
    candidates: [
      '로봇장난감', '자동차장난감', '변신로봇', '작동완구', 'RC카',
      '드론', '헬리콥터장난감', '기차장난감', '포크레인장난감', '트럭장난감',
      '전동장난감', '사운드북', '로봇완구', '미니카', '레이싱카',
      '건담', '또봇', '카봇', '무선조종자동차', '터닝메카드',
    ],
  },
  fancy_sticker: {
    key: 'fancy_sticker',
    label: '스티커·다꾸',
    cid: 50007588,
    categoryPath: '문구/사무용품 > 스티커',
    candidates: [
      '스티커', '다꾸스티커', '캐릭터스티커', '네임스티커', '보석스티커',
      '칭찬스티커', '투명스티커', '마스킹테이프', '씰스티커', '스티커북',
      '유포지스티커', '떡메모지', '다꾸', '인쇄스티커', '폼폼스티커',
      '반짝이스티커', '도형스티커', '알파벳스티커', '숫자스티커', '포토카드스티커',
    ],
  },
  fancy_goods: {
    key: 'fancy_goods',
    label: '팬시문구',
    cid: 50007749,
    categoryPath: '문구/사무용품 > 문구용품',
    candidates: [
      '캐릭터문구', '팬시문구', '키링', '필통', '문구세트',
      '말랑이', '스퀴시', '인형키링', '파우치', '텀블러',
      '물병', '도장', '지우개', '볼펜세트', '학용품세트',
      '캐릭터소품', '피젯토이', '슬라임', '미니어처소품', '문구선물세트',
    ],
  },
  stationery_writing: {
    key: 'stationery_writing',
    label: '필기·노트',
    cid: 50001041,
    categoryPath: '문구/사무용품 > 필기도구',
    candidates: [
      '샤프', '볼펜', '연필', '사인펜', '필기구',
      '형광펜', '만년필', '색연필', '젤펜', '중성펜',
      '네임펜', '유성매직', '붓펜', '샤프심', '볼펜심',
      '지우개', '연필깎이', '드로잉펜', '마카펜', '캘리그라피펜',
    ],
  },
  toys_roleplay: {
    key: 'toys_roleplay',
    label: '역할놀이',
    cid: 50001165,
    categoryPath: '완구/인형 > 역할놀이/소꿉놀이',
    candidates: [
      '소꿉놀이', '역할놀이', '주방놀이', '병원놀이', '공구놀이',
      '마트놀이', '화장대놀이', '인형집', '베이비돌', '청소놀이',
      '미용놀이', '계산대놀이', '아기주방놀이', '과일자르기', '소꿉세트',
      '역할놀이세트', '놀이텐트', '키친놀이', '장난감주방', '놀이집',
    ],
  },
  toys_puzzle: {
    key: 'toys_puzzle',
    label: '퍼즐·교구',
    cid: 50001168,
    categoryPath: '완구/인형 > 유아동퍼즐',
    candidates: [
      '유아퍼즐', '자석퍼즐', '원목퍼즐', '유아교구', '보드게임',
      '직소퍼즐', '큐브', '루빅스큐브', '판퍼즐', '입체퍼즐',
      '숫자교구', '한글교구', '몬테소리교구', '블록퍼즐', '플레이도우',
      '미로찾기', '도미노', '수학교구', '칠교놀이', '논리게임',
    ],
  },
  fancy_diary: {
    key: 'fancy_diary',
    label: '다이어리·플래너',
    cid: 50001039,
    categoryPath: '문구/사무용품 > 다이어리/플래너',
    candidates: [
      '다이어리', '플래너', '꾸미기다이어리', '스케줄러', '다꾸',
      '만년다이어리', '위클리플래너', '스터디플래너', '먼슬리플래너', '다이어리속지',
      '바인더', '6공다이어리', '캐릭터다이어리', '가계부', '일기장',
      '플래너스티커', '데일리플래너', '수제다이어리', '포켓다이어리', '탁상달력',
    ],
  },
  stationery_note: {
    key: 'stationery_note',
    label: '노트·메모',
    cid: 50001040,
    categoryPath: '문구/사무용품 > 노트/수첩',
    candidates: [
      '노트', '메모지', '수첩', '캐릭터노트', '떡메모지',
      '스프링노트', '유선노트', '무지노트', '포스트잇', '점착메모지',
      '연습장', '드로잉북', '스케치북', '원고지', '단어장',
      '독서기록장', '오답노트', '업무수첩', '메모패드', '떡메모',
    ],
  },
};

@Injectable()
export class NaverDatalabPopularKeywordAdapter implements NaverDatalabPopularKeywordPort {
  private readonly cache = new Map<string, CachedShoppingInsightResponse>();

  async searchPopularKeywords(
    input: SearchNaverDatalabPopularKeywordsInput,
  ): Promise<SearchNaverDatalabPopularKeywordsResult> {
    const config = readConfig();
    if (!config) {
      throw new ServiceUnavailableException(
        `NAVER API HUB 키가 설정되지 않았습니다. apps/server/.env에 ${REQUIRED_ENV.join(', ')}를 설정해주세요.`,
      );
    }

    const timeUnit = input.timeUnit ?? 'date';
    const range = resolveDateRange(timeUnit, input.startDate, input.endDate);
    const limit = normalizeLimit(input.limit);
    const requestedCandidates = normalizeCandidates(input.keywords);
    const boards = normalizeBoardKeys(input.boardKeys).map((key) => BOARD_PRESETS[key]);
    const filters = {
      device: input.device ?? null,
      gender: input.gender ?? null,
      ages: normalizeAges(input.ages),
    };

    const resolvedBoards: NaverDatalabPopularKeywordBoard[] = [];
    for (const board of boards) {
      const candidates = (requestedCandidates.length > 0 ? requestedCandidates : board.candidates)
        .slice(0, limit);
      try {
        resolvedBoards.push(await this.fetchBoard(config, board, {
          ...range,
          timeUnit,
          ...filters,
          candidates,
        }));
      } catch (error) {
        resolvedBoards.push(toFailedBoard(board, error));
      }
    }

    return {
      source: 'naver-datalab-shopping-keyword-rank',
      timeUnit,
      startDate: range.startDate,
      endDate: range.endDate,
      device: filters.device,
      gender: filters.gender,
      ages: filters.ages,
      generatedAt: new Date().toISOString(),
      boards: resolvedBoards,
    };
  }

  private async fetchBoard(
    config: NaverApiHubConfig,
    board: PopularKeywordBoardPreset,
    input: {
      timeUnit: NaverDatalabTimeUnit;
      startDate: string;
      endDate: string;
      device: string | null;
      gender: string | null;
      ages: string[];
      candidates: readonly string[];
    },
  ): Promise<NaverDatalabPopularKeywordBoard> {
    // ratio 는 "요청 안에서" 최대 100 으로 정규화되므로 배치별 점수를 그대로 합치면
    // 서로 비교할 수 없다. 모든 배치가 공유하는 앵커(첫 후보)의 점수 비율로 재척도한다.
    const batches = buildCandidateBatches(input.candidates);
    const anchor = normalizeKeyword(input.candidates[0] ?? '');
    const scores = new Map<string, number>();
    let anchorBaseline: number | null = null;
    let endDate = input.endDate;

    for (const [index, batch] of batches.entries()) {
      if (index > 0) await delay(BATCH_DELAY_MS);
      const response = await this.fetchKeywordTrends(config, board.cid, { ...input, candidates: batch });
      if (index === 0) endDate = response.endDate ?? input.endDate;

      const batchScores = sumRatiosByKeyword(response);
      const anchorScore = batchScores.get(anchor) ?? 0;
      let factor = 1;
      if (index === 0) {
        anchorBaseline = anchorScore;
      } else if (anchorBaseline != null && anchorBaseline > 0 && anchorScore > 0) {
        factor = anchorBaseline / anchorScore;
      }

      for (const keyword of batch) {
        const key = normalizeKeyword(keyword);
        // 앵커는 첫 배치 점수를 기준으로 삼으므로 이후 배치에서 덮어쓰지 않는다.
        if (index > 0 && key === anchor) continue;
        scores.set(key, (batchScores.get(key) ?? 0) * factor);
      }
    }

    return {
      key: board.key,
      label: board.label,
      cid: board.cid,
      categoryPath: board.categoryPath,
      date: endDate,
      datetime: '',
      range: formatDisplayRange(input.startDate, input.endDate),
      ranks: rankCandidatesByScore(input.candidates, scores, [board.label]),
      error: null,
    };
  }

  private async fetchKeywordTrends(
    config: NaverApiHubConfig,
    cid: number,
    input: {
      timeUnit: NaverDatalabTimeUnit;
      startDate: string;
      endDate: string;
      device: string | null;
      gender: string | null;
      ages: string[];
      candidates: readonly string[];
    },
  ): Promise<ShoppingInsightKeywordTrendResponse> {
    const body = {
      startDate: input.startDate,
      endDate: input.endDate,
      timeUnit: input.timeUnit,
      category: String(cid),
      keyword: input.candidates.map((keyword) => ({ name: keyword, param: [keyword] })),
      ...(input.device ? { device: input.device } : {}),
      ...(input.gender ? { gender: input.gender } : {}),
      ...(input.ages.length > 0 ? { ages: input.ages } : {}),
    };
    const cacheKey = JSON.stringify(body);
    const cached = this.readCache(cacheKey);
    if (cached) return cached;

    const response = await fetch(`${config.baseUrl}${SHOPPING_KEYWORD_TREND_URI}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-NCP-APIGW-API-KEY-ID': config.clientId,
        'X-NCP-APIGW-API-KEY': config.clientSecret,
      },
      body: JSON.stringify(body),
    });
    const bodyText = await response.text();
    if (!response.ok) {
      throw new BadGatewayException(
        `NAVER API HUB Shopping Insight 호출 실패 (${response.status}): ${bodyText.slice(0, 300)}`,
      );
    }

    const parsed = parseJsonResponse(bodyText);
    this.writeCache(cacheKey, parsed);
    return parsed;
  }

  private readCache(key: string): ShoppingInsightKeywordTrendResponse | null {
    const cached = this.cache.get(key);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return cached.value;
  }

  private writeCache(key: string, value: ShoppingInsightKeywordTrendResponse): void {
    this.cache.set(key, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      value,
    });
  }
}

function sumRatiosByKeyword(response: ShoppingInsightKeywordTrendResponse): Map<string, number> {
  const scores = new Map<string, number>();
  for (const result of response.results ?? []) {
    const keyword = String(result.title ?? result.keyword?.[0] ?? '').trim();
    if (!keyword) continue;
    const score = (result.data ?? []).reduce((sum, point) => {
      return sum + (typeof point.ratio === 'number' && Number.isFinite(point.ratio) ? point.ratio : 0);
    }, 0);
    const key = normalizeKeyword(keyword);
    scores.set(key, (scores.get(key) ?? 0) + score);
  }
  return scores;
}

// API HUB Shopping Insight는 인기검색어 목록을 제공하지 않는다. 보드 후보 풀의 기간별
// 상대 클릭비율 합계(배치 간 앵커 재척도 적용)를 호환 보드의 rank로 사용한다.
function rankCandidatesByScore(
  candidates: readonly string[],
  scores: Map<string, number>,
  categories: string[],
): NaverDatalabPopularKeywordRank[] {
  return candidates
    .map((keyword, candidateOrder) => ({
      keyword,
      candidateOrder,
      score: scores.get(normalizeKeyword(keyword)) ?? 0,
    }))
    .sort((a, b) => b.score - a.score || a.candidateOrder - b.candidateOrder)
    .map((item, index) => ({
      rank: index + 1,
      keyword: item.keyword,
      linkId: null,
      categories,
    }));
}

// 첫 배치는 후보 상위 5개, 이후 배치는 [앵커 + 새 후보 4개] 형태로 나눈다.
function buildCandidateBatches(candidates: readonly string[]): string[][] {
  if (candidates.length <= MAX_KEYWORDS_PER_REQUEST) return [[...candidates]];
  const anchor = candidates[0];
  const batches: string[][] = [candidates.slice(0, MAX_KEYWORDS_PER_REQUEST)];
  const step = MAX_KEYWORDS_PER_REQUEST - 1;
  for (let index = MAX_KEYWORDS_PER_REQUEST; index < candidates.length; index += step) {
    batches.push([anchor, ...candidates.slice(index, index + step)]);
  }
  return batches;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeBoardKeys(keys?: NaverDatalabPopularKeywordBoardKey[]): NaverDatalabPopularKeywordBoardKey[] {
  const requested = keys?.length ? keys : DEFAULT_BOARD_KEYS;
  return Array.from(new Set(requested)).filter((key) => key in BOARD_PRESETS);
}

function normalizeCandidates(keywords?: string[]): string[] {
  return Array.from(new Set(
    (keywords ?? [])
      .map((keyword) => keyword.trim())
      .filter(Boolean),
  )).slice(0, MAX_LIMIT);
}

function normalizeLimit(limit?: number): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)));
}

function normalizeAges(ages?: string[]): string[] {
  const allowed = new Set(['10', '20', '30', '40', '50', '60']);
  return Array.from(new Set((ages ?? []).map((age) => age.trim()).filter((age) => allowed.has(age))));
}

function normalizeKeyword(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

function resolveDateRange(
  timeUnit: NaverDatalabTimeUnit,
  startDate?: string,
  endDate?: string,
): { startDate: string; endDate: string } {
  const fallback = defaultDateRange(timeUnit);
  return {
    startDate: startDate ?? fallback.startDate,
    endDate: endDate ?? fallback.endDate,
  };
}

function defaultDateRange(timeUnit: NaverDatalabTimeUnit, now = new Date()): { startDate: string; endDate: string } {
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
  const end = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()));
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  if (timeUnit === 'month') {
    start.setUTCMonth(start.getUTCMonth() - 1);
  } else {
    start.setUTCDate(start.getUTCDate() - 6);
  }
  return {
    startDate: formatDate(start),
    endDate: formatDate(end),
  };
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDisplayRange(startDate: string, endDate: string): string {
  if (startDate === endDate) return `${startDate.replaceAll('-', '.')}.`;
  return `${startDate.replaceAll('-', '.')}. ~ ${endDate.replaceAll('-', '.')}.`;
}

function readConfig(): NaverApiHubConfig | null {
  const clientId = process.env.NAVER_API_HUB_CLIENT_ID?.trim();
  const clientSecret = process.env.NAVER_API_HUB_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    baseUrl: process.env.NAVER_API_HUB_BASE_URL?.trim() || DEFAULT_BASE_URL,
  };
}

function parseJsonResponse(bodyText: string): ShoppingInsightKeywordTrendResponse {
  try {
    const parsed = JSON.parse(bodyText) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid response');
    return parsed as ShoppingInsightKeywordTrendResponse;
  } catch {
    throw new BadGatewayException('NAVER API HUB Shopping Insight가 JSON이 아닌 응답을 반환했습니다.');
  }
}

function toFailedBoard(board: PopularKeywordBoardPreset, error: unknown): NaverDatalabPopularKeywordBoard {
  return {
    key: board.key,
    label: board.label,
    cid: board.cid,
    categoryPath: board.categoryPath,
    date: '',
    datetime: '',
    range: '',
    ranks: [],
    error: error instanceof Error ? error.message : String(error),
  };
}
