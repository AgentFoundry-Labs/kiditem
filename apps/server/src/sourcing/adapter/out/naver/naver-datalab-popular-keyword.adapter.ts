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
const DEFAULT_LIMIT = 5;
const MAX_KEYWORDS_PER_REQUEST = 5;
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

const BOARD_PRESETS: Record<NaverDatalabPopularKeywordBoardKey, PopularKeywordBoardPreset> = {
  all_categories: {
    key: 'all_categories',
    label: '필터 없음 TOP',
    cid: 50000005,
    categoryPath: '출산/육아 전체 · Shopping Insight 후보 비교',
    candidates: ['유아완구', '유아용품', '아기옷', '유아교구', '어린이장난감'],
  },
  birth_kids: {
    key: 'birth_kids',
    label: '출산/육아',
    cid: 50000005,
    categoryPath: '출산/육아',
    candidates: ['유아완구', '유아용품', '아기옷', '유아교구', '어린이장난감'],
  },
  toys_dolls: {
    key: 'toys_dolls',
    label: '완구/인형',
    cid: 50000142,
    categoryPath: '출산/육아 > 완구/인형',
    candidates: ['레고', '포켓몬카드', '캐릭터인형', '역할놀이', '유아블록'],
  },
  stationery_office: {
    key: 'stationery_office',
    label: '문구/사무용품',
    cid: 50000158,
    categoryPath: '생활/건강 > 문구/사무용품',
    candidates: ['스티커', '다이어리', '필기구', '노트', '학용품'],
  },
  kids_fashion: {
    key: 'kids_fashion',
    label: '유아동의류',
    cid: 50000138,
    categoryPath: '출산/육아 > 유아동의류',
    candidates: ['유아동복', '키즈원피스', '아동상하복', '아동내복', '키즈운동화'],
  },
  toys_block: {
    key: 'toys_block',
    label: '블록완구',
    cid: 50001159,
    categoryPath: '완구/인형 > 블록',
    candidates: ['레고', '자석블록', '유아블록', '조립블록', '블록완구'],
  },
  toys_action: {
    key: 'toys_action',
    label: '작동완구',
    cid: 50001154,
    categoryPath: '완구/인형 > 작동완구',
    candidates: ['로봇장난감', '자동차장난감', '변신로봇', '작동완구', 'RC카'],
  },
  fancy_sticker: {
    key: 'fancy_sticker',
    label: '스티커·다꾸',
    cid: 50007588,
    categoryPath: '문구/사무용품 > 스티커',
    candidates: ['스티커', '다꾸스티커', '캐릭터스티커', '네임스티커', '보석스티커'],
  },
  fancy_goods: {
    key: 'fancy_goods',
    label: '팬시문구',
    cid: 50007749,
    categoryPath: '문구/사무용품 > 문구용품',
    candidates: ['캐릭터문구', '팬시문구', '키링', '필통', '문구세트'],
  },
  stationery_writing: {
    key: 'stationery_writing',
    label: '필기·노트',
    cid: 50001041,
    categoryPath: '문구/사무용품 > 필기도구',
    candidates: ['샤프', '볼펜', '연필', '사인펜', '필기구'],
  },
  toys_roleplay: {
    key: 'toys_roleplay',
    label: '역할놀이',
    cid: 50001165,
    categoryPath: '완구/인형 > 역할놀이/소꿉놀이',
    candidates: ['소꿉놀이', '역할놀이', '주방놀이', '병원놀이', '공구놀이'],
  },
  toys_puzzle: {
    key: 'toys_puzzle',
    label: '퍼즐·교구',
    cid: 50001168,
    categoryPath: '완구/인형 > 유아동퍼즐',
    candidates: ['유아퍼즐', '자석퍼즐', '원목퍼즐', '유아교구', '보드게임'],
  },
  fancy_diary: {
    key: 'fancy_diary',
    label: '다이어리·플래너',
    cid: 50001039,
    categoryPath: '문구/사무용품 > 다이어리/플래너',
    candidates: ['다이어리', '플래너', '꾸미기다이어리', '스케줄러', '다꾸'],
  },
  stationery_note: {
    key: 'stationery_note',
    label: '노트·메모',
    cid: 50001040,
    categoryPath: '문구/사무용품 > 노트/수첩',
    candidates: ['노트', '메모지', '수첩', '캐릭터노트', '떡메모지'],
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
    const response = await this.fetchKeywordTrends(config, board.cid, input);
    return {
      key: board.key,
      label: board.label,
      cid: board.cid,
      categoryPath: board.categoryPath,
      date: response.endDate ?? input.endDate,
      datetime: '',
      range: formatDisplayRange(input.startDate, input.endDate),
      ranks: rankCandidatesBySummedRatio(response, input.candidates, [board.label]),
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

function rankCandidatesBySummedRatio(
  response: ShoppingInsightKeywordTrendResponse,
  candidates: readonly string[],
  categories: string[],
): NaverDatalabPopularKeywordRank[] {
  const scored = candidates.map((keyword, candidateOrder) => ({
    keyword,
    candidateOrder,
    score: 0,
  }));
  const byKeyword = new Map(scored.map((item) => [normalizeKeyword(item.keyword), item]));

  for (const result of response.results ?? []) {
    const keyword = String(result.title ?? result.keyword?.[0] ?? '').trim();
    const target = byKeyword.get(normalizeKeyword(keyword));
    if (!target) continue;
    target.score += (result.data ?? []).reduce((sum, point) => {
      return sum + (typeof point.ratio === 'number' && Number.isFinite(point.ratio) ? point.ratio : 0);
    }, 0);
  }

  // API HUB Shopping Insight는 인기검색어 목록을 제공하지 않는다. 같은 요청에서
  // 비교한 최대 5개 후보의 기간별 상대 클릭비율 합계를 호환 보드의 rank로 사용한다.
  return scored
    .sort((a, b) => b.score - a.score || a.candidateOrder - b.candidateOrder)
    .map((item, index) => ({
      rank: index + 1,
      keyword: item.keyword,
      linkId: null,
      categories,
    }));
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
  )).slice(0, MAX_KEYWORDS_PER_REQUEST);
}

function normalizeLimit(limit?: number): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(MAX_KEYWORDS_PER_REQUEST, Math.max(1, Math.floor(limit)));
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
