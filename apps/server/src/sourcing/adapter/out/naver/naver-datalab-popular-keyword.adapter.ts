import { BadGatewayException, Injectable } from '@nestjs/common';
import type {
  NaverDatalabPopularKeywordBoard,
  NaverDatalabPopularKeywordBoardKey,
  NaverDatalabPopularKeywordPort,
  NaverDatalabPopularKeywordRank,
  NaverDatalabTimeUnit,
  SearchNaverDatalabPopularKeywordsInput,
  SearchNaverDatalabPopularKeywordsResult,
} from '../../../application/port/out/provider/naver-keyword-research.port';

const DEFAULT_WEB_BASE_URL = 'https://datalab.naver.com';
const KEYWORD_RANK_URI = '/shoppingInsight/getKeywordRank.naver';
const CATEGORY_KEYWORD_RANK_URI = '/shoppingInsight/getCategoryKeywordRank.naver';
const DEFAULT_BOARD_KEYS: NaverDatalabPopularKeywordBoardKey[] = [
  'all_categories',
  'birth_kids',
  'toys_dolls',
  'stationery_office',
  'kids_fashion',
];
const DEFAULT_LIMIT = 20;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const CATEGORY_REQUEST_DELAY_MS = 600;
const CATEGORY_PAGE_DELAY_MS = 600;
const NAVER_CATEGORY_PAGE_SIZE = 20; // 네이버 카테고리 순위는 count 무시하고 페이지당 20개 고정
const NAVER_CATEGORY_MAX_PAGES = 25; // 상한 20×25=500개(page 26부터 빈 배열)
const CACHE_TTL_MS = 10 * 60 * 1000;

interface PopularKeywordBoardPreset {
  key: NaverDatalabPopularKeywordBoardKey;
  label: string;
  cid: number;
  categoryPath: string;
  mode: 'keyword-rank' | 'category-keyword-rank';
}

interface CachedCategoryKeywordRank {
  expiresAt: number;
  value: NaverDatalabCategoryKeywordRankResponse;
}

interface NaverDatalabCategoryKeywordRankResponse {
  message?: string | null;
  statusCode?: number;
  returnCode?: number;
  date?: string;
  datetime?: string;
  range?: string;
  ranks?: Array<{
    rank?: number;
    keyword?: string;
    linkId?: string;
  }>;
}

const BOARD_PRESETS: Record<NaverDatalabPopularKeywordBoardKey, PopularKeywordBoardPreset> = {
  all_categories: {
    key: 'all_categories',
    label: '필터 없음 TOP',
    cid: 50000005,
    categoryPath: '출산/육아 전체 · DataLab 기본 인기검색어',
    mode: 'keyword-rank',
  },
  birth_kids: {
    key: 'birth_kids',
    label: '출산/육아',
    cid: 50000005,
    categoryPath: '출산/육아',
    mode: 'category-keyword-rank',
  },
  toys_dolls: {
    key: 'toys_dolls',
    label: '완구/인형',
    cid: 50000142,
    categoryPath: '출산/육아 > 완구/인형',
    mode: 'category-keyword-rank',
  },
  stationery_office: {
    key: 'stationery_office',
    label: '문구/사무용품',
    cid: 50000158,
    categoryPath: '생활/건강 > 문구/사무용품',
    mode: 'category-keyword-rank',
  },
  kids_fashion: {
    key: 'kids_fashion',
    label: '유아동의류',
    cid: 50000138,
    categoryPath: '출산/육아 > 유아동의류',
    mode: 'category-keyword-rank',
  },
  toys_block: {
    key: 'toys_block',
    label: '블록완구',
    cid: 50001159,
    categoryPath: '완구/인형 > 블록',
    mode: 'category-keyword-rank',
  },
  toys_action: {
    key: 'toys_action',
    label: '작동완구',
    cid: 50001154,
    categoryPath: '완구/인형 > 작동완구',
    mode: 'category-keyword-rank',
  },
  fancy_sticker: {
    key: 'fancy_sticker',
    label: '스티커·다꾸',
    cid: 50007588,
    categoryPath: '문구/사무용품 > 스티커',
    mode: 'category-keyword-rank',
  },
  fancy_goods: {
    key: 'fancy_goods',
    label: '팬시문구',
    cid: 50007749,
    categoryPath: '문구/사무용품 > 문구용품',
    mode: 'category-keyword-rank',
  },
  stationery_writing: {
    key: 'stationery_writing',
    label: '필기·노트',
    cid: 50001041,
    categoryPath: '문구/사무용품 > 필기도구',
    mode: 'category-keyword-rank',
  },
  toys_roleplay: {
    key: 'toys_roleplay',
    label: '역할놀이',
    cid: 50001165,
    categoryPath: '완구/인형 > 역할놀이/소꿉놀이',
    mode: 'category-keyword-rank',
  },
  toys_puzzle: {
    key: 'toys_puzzle',
    label: '퍼즐·교구',
    cid: 50001168,
    categoryPath: '완구/인형 > 유아동퍼즐',
    mode: 'category-keyword-rank',
  },
  fancy_diary: {
    key: 'fancy_diary',
    label: '다이어리·플래너',
    cid: 50001039,
    categoryPath: '문구/사무용품 > 다이어리/플래너',
    mode: 'category-keyword-rank',
  },
  stationery_note: {
    key: 'stationery_note',
    label: '노트·메모',
    cid: 50001040,
    categoryPath: '문구/사무용품 > 노트/수첩',
    mode: 'category-keyword-rank',
  },
};

@Injectable()
export class NaverDatalabPopularKeywordAdapter implements NaverDatalabPopularKeywordPort {
  private readonly cache = new Map<string, CachedCategoryKeywordRank>();

  async searchPopularKeywords(
    input: SearchNaverDatalabPopularKeywordsInput,
  ): Promise<SearchNaverDatalabPopularKeywordsResult> {
    const timeUnit = input.timeUnit ?? 'date';
    const range = resolveDateRange(timeUnit, input.startDate, input.endDate);
    const limit = input.limit ?? DEFAULT_LIMIT;
    const boards = normalizeBoardKeys(input.boardKeys).map((key) => BOARD_PRESETS[key]);
    const filters = {
      device: input.device ?? null,
      gender: input.gender ?? null,
      ages: normalizeAges(input.ages),
    };

    const resolvedBoards: NaverDatalabPopularKeywordBoard[] = [];
    for (let index = 0; index < boards.length; index += 1) {
      if (index > 0) await sleep(CATEGORY_REQUEST_DELAY_MS);
      const board = boards[index];
      try {
        resolvedBoards.push(await this.fetchBoard(board, {
          timeUnit,
          startDate: range.startDate,
          endDate: range.endDate,
          device: filters.device,
          gender: filters.gender,
          ages: filters.ages,
          limit,
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
    board: PopularKeywordBoardPreset,
    input: {
      timeUnit: NaverDatalabTimeUnit;
      startDate: string;
      endDate: string;
      device: string | null;
      gender: string | null;
      ages: string[];
      limit: number;
    },
  ): Promise<NaverDatalabPopularKeywordBoard> {
    const response = board.mode === 'keyword-rank'
      ? await this.fetchKeywordRank(board.cid, input.timeUnit, input.limit)
      : await this.fetchCategoryKeywordRank(board.cid, input);
    return {
      key: board.key,
      label: board.label,
      cid: board.cid,
      categoryPath: board.categoryPath,
      date: response.date ?? '',
      datetime: response.datetime ?? '',
      range: response.range || formatDisplayRange(input.startDate, input.endDate),
      ranks: normalizeRanks(response.ranks ?? [], input.limit, [board.label]),
      error: null,
    };
  }

  private async fetchKeywordRank(
    cid: number,
    timeUnit: NaverDatalabTimeUnit,
    limit: number,
  ): Promise<NaverDatalabCategoryKeywordRankResponse> {
    const url = new URL(`${readBaseUrl()}${KEYWORD_RANK_URI}`);
    url.searchParams.set('timeUnit', timeUnit);
    url.searchParams.set('cid', String(cid));
    const cacheKey = `keyword:${timeUnit}:${cid}:${limit}`;
    const cached = this.readCache(cacheKey);
    if (cached) return cached;

    const response = await fetch(url, {
      headers: naverDatalabHeaders(),
      redirect: 'follow',
    });
    const bodyText = await response.text();
    if (!response.ok) {
      throw new BadGatewayException(`네이버 DataLab 기본 인기검색어 호출 실패 (${response.status})`);
    }

    const parsed = parseJsonResponse(bodyText);
    const candidates = Array.isArray(parsed) ? parsed : [parsed];
    const latest = candidates.find((item) => item?.returnCode === 0 && Array.isArray(item.ranks));
    if (!latest) {
      throw new BadGatewayException('네이버 DataLab 기본 인기검색어가 빈 응답을 반환했습니다.');
    }
    this.writeCache(cacheKey, latest);
    return latest;
  }

  private async fetchCategoryKeywordRank(
    cid: number,
    input: {
      timeUnit: NaverDatalabTimeUnit;
      startDate: string;
      endDate: string;
      device: string | null;
      gender: string | null;
      ages: string[];
      limit: number;
    },
  ): Promise<NaverDatalabCategoryKeywordRankResponse> {
    const cacheKey = [
      'category',
      cid,
      input.timeUnit,
      input.startDate,
      input.endDate,
      input.device ?? '',
      input.gender ?? '',
      input.ages.join(','),
      input.limit,
    ].join(':');
    const cached = this.readCache(cacheKey);
    if (cached) return cached;

    // 네이버 카테고리 순위는 페이지당 20개 고정이라, 요청한 limit 만큼 페이지를 이어 붙인다.
    const pageCount = Math.min(
      Math.max(1, Math.ceil(input.limit / NAVER_CATEGORY_PAGE_SIZE)),
      NAVER_CATEGORY_MAX_PAGES,
    );
    const ranks: NonNullable<NaverDatalabCategoryKeywordRankResponse['ranks']> = [];
    let first: NaverDatalabCategoryKeywordRankResponse | null = null;
    for (let page = 1; page <= pageCount; page += 1) {
      if (page > 1) await sleep(CATEGORY_PAGE_DELAY_MS);
      const pageResult = await this.fetchCategoryKeywordRankPage(cid, input, page);
      if (page === 1) first = pageResult;
      const pageRanks = pageResult.ranks ?? [];
      if (pageRanks.length === 0) break;
      ranks.push(...pageRanks);
      if (pageRanks.length < NAVER_CATEGORY_PAGE_SIZE) break; // 마지막 페이지
    }

    const merged: NaverDatalabCategoryKeywordRankResponse = {
      ...(first ?? { returnCode: 0 }),
      ranks: ranks.slice(0, input.limit),
    };
    this.writeCache(cacheKey, merged);
    return merged;
  }

  private async fetchCategoryKeywordRankPage(
    cid: number,
    input: {
      timeUnit: NaverDatalabTimeUnit;
      startDate: string;
      endDate: string;
      device: string | null;
      gender: string | null;
      ages: string[];
      limit: number;
    },
    page: number,
  ): Promise<NaverDatalabCategoryKeywordRankResponse> {
    const body = new URLSearchParams({
      cid: String(cid),
      timeUnit: input.timeUnit,
      startDate: input.startDate,
      endDate: input.endDate,
      age: input.ages.join(','),
      gender: input.gender ?? '',
      device: input.device ?? '',
      page: String(page),
      count: String(NAVER_CATEGORY_PAGE_SIZE),
    });
    const response = await fetch(`${readBaseUrl()}${CATEGORY_KEYWORD_RANK_URI}`, {
      method: 'POST',
      headers: naverDatalabHeaders(),
      body,
      redirect: 'follow',
    });

    const bodyText = await response.text();
    if (!response.ok) {
      throw new BadGatewayException(`네이버 DataLab 인기검색어 호출 실패 (${response.status})`);
    }

    try {
      const parsed = parseJsonResponse(bodyText) as NaverDatalabCategoryKeywordRankResponse;
      if (parsed.returnCode !== 0) {
        throw new BadGatewayException(parsed.message ?? '네이버 DataLab 인기검색어가 실패 응답을 반환했습니다.');
      }
      return parsed;
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      throw new BadGatewayException('네이버 DataLab 인기검색어가 JSON이 아닌 응답을 반환했습니다.');
    }
  }

  private readCache(key: string): NaverDatalabCategoryKeywordRankResponse | null {
    const cached = this.cache.get(key);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return cached.value;
  }

  private writeCache(key: string, value: NaverDatalabCategoryKeywordRankResponse): void {
    this.cache.set(key, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      value,
    });
  }
}

function normalizeBoardKeys(keys?: NaverDatalabPopularKeywordBoardKey[]): NaverDatalabPopularKeywordBoardKey[] {
  const requested = keys?.length ? keys : DEFAULT_BOARD_KEYS;
  return Array.from(new Set(requested)).filter((key) => key in BOARD_PRESETS);
}

function normalizeAges(ages?: string[]): string[] {
  const allowed = new Set(['10', '20', '30', '40', '50', '60']);
  return Array.from(new Set((ages ?? []).map((age) => age.trim()).filter((age) => allowed.has(age))));
}

function normalizeRanks(
  ranks: NonNullable<NaverDatalabCategoryKeywordRankResponse['ranks']>,
  limit: number,
  categories: string[],
): NaverDatalabPopularKeywordRank[] {
  return ranks
    .map((rank, index) => ({
      rank: typeof rank.rank === 'number' ? rank.rank : index + 1,
      keyword: String(rank.keyword ?? '').trim(),
      linkId: rank.linkId ? String(rank.linkId) : null,
      categories,
    }))
    .filter((rank) => rank.keyword)
    .slice(0, limit);
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
  } else if (timeUnit === 'week') {
    start.setUTCDate(start.getUTCDate() - 6);
  } else {
    // 'date': 최근 단일일(startDate===endDate)로 카테고리 순위를 요청하면 네이버
    // 쇼핑인사이트 집계 지연으로 returnCode 0 + ranks:[] 빈 배열이 온다(어제 07-13
    // → 빔, 07-07~07-13 범위 → 20건 확인). 최근 7일 범위로 조회해 데이터를 확보한다.
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

function readBaseUrl(): string {
  return process.env.NAVER_DATALAB_WEB_BASE_URL?.trim() || DEFAULT_WEB_BASE_URL;
}

function naverDatalabHeaders(): HeadersInit {
  return {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    Referer: `${readBaseUrl()}/shoppingInsight/sCategory.naver`,
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'X-Requested-With': 'XMLHttpRequest',
  };
}

function parseJsonResponse(bodyText: string): NaverDatalabCategoryKeywordRankResponse | NaverDatalabCategoryKeywordRankResponse[] {
  try {
    return JSON.parse(bodyText) as NaverDatalabCategoryKeywordRankResponse | NaverDatalabCategoryKeywordRankResponse[];
  } catch {
    throw new BadGatewayException('네이버 DataLab 인기검색어가 JSON이 아닌 응답을 반환했습니다.');
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
