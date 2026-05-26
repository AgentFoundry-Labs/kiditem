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
const CATEGORY_REQUEST_DELAY_MS = 300;
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

    const body = new URLSearchParams({
      cid: String(cid),
      timeUnit: input.timeUnit,
      startDate: input.startDate,
      endDate: input.endDate,
      age: input.ages.join(','),
      gender: input.gender ?? '',
      device: input.device ?? '',
      page: '1',
      count: String(input.limit),
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
      this.writeCache(cacheKey, parsed);
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
    start.setUTCDate(start.getUTCDate());
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
