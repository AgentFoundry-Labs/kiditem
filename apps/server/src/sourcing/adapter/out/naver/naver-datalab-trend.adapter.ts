import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type {
  CompareNaverDatalabSearchTrendsInput,
  CompareNaverDatalabSearchTrendsResult,
  NaverDatalabKeywordTrend,
  NaverDatalabTimeUnit,
  NaverDatalabTrendPort,
  NaverDatalabTrendStatus,
} from '../../../application/port/out/provider/naver-keyword-research.port';

const REQUIRED_ENV = ['NAVER_DATALAB_CLIENT_ID', 'NAVER_DATALAB_CLIENT_SECRET'];
const DEFAULT_BASE_URL = 'https://openapi.naver.com';
const SEARCH_TREND_URI = '/v1/datalab/search';
const MAX_KEYWORDS_PER_DATALAB_REQUEST = 5;
const MAX_KEYWORDS_PER_RANKING = 50;

interface NaverDatalabConfig {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
}

interface NaverDatalabSearchTrendResponse {
  startDate?: string;
  endDate?: string;
  timeUnit?: NaverDatalabTimeUnit;
  results?: Array<{
    title?: string;
    keywords?: string[];
    data?: Array<{
      period?: string;
      ratio?: number;
    }>;
  }>;
}

@Injectable()
export class NaverDatalabTrendAdapter implements NaverDatalabTrendPort {
  getStatus(): NaverDatalabTrendStatus {
    return {
      configured: this.readConfig() !== null,
      requiredEnv: REQUIRED_ENV,
    };
  }

  async compareSearchTrends(
    input: CompareNaverDatalabSearchTrendsInput,
  ): Promise<CompareNaverDatalabSearchTrendsResult> {
    const config = this.readConfig();
    if (!config) {
      throw new ServiceUnavailableException(
        '네이버 DataLab API 키가 설정되지 않았습니다. apps/server/.env에 NAVER_DATALAB_CLIENT_ID, NAVER_DATALAB_CLIENT_SECRET를 설정해주세요.',
      );
    }

    const keywords = normalizeKeywords(input.keywords);
    const range = resolveDateRange(input.startDate, input.endDate);
    const timeUnit = input.timeUnit ?? 'date';
    if (keywords.length === 0) {
      return {
        source: 'naver-datalab-search-trend',
        keywords,
        startDate: range.startDate,
        endDate: range.endDate,
        timeUnit,
        generatedAt: new Date().toISOString(),
        items: [],
      };
    }

    const items: NaverDatalabKeywordTrend[] = [];
    for (const batch of chunk(keywords, MAX_KEYWORDS_PER_DATALAB_REQUEST)) {
      const parsed = await this.fetchSearchTrends(config, {
        keywords: batch,
        startDate: range.startDate,
        endDate: range.endDate,
        timeUnit,
        device: input.device,
        gender: input.gender,
        ages: input.ages,
      });
      items.push(...(parsed.results ?? []).map(mapTrendResult));
    }

    return {
      source: 'naver-datalab-search-trend',
      keywords,
      startDate: range.startDate,
      endDate: range.endDate,
      timeUnit,
      generatedAt: new Date().toISOString(),
      items: items.sort(compareTrends),
    };
  }

  private async fetchSearchTrends(
    config: NaverDatalabConfig,
    input: {
      keywords: string[];
      startDate: string;
      endDate: string;
      timeUnit: NaverDatalabTimeUnit;
      device?: string;
      gender?: string;
      ages?: string[];
    },
  ): Promise<NaverDatalabSearchTrendResponse> {
    const body = {
      startDate: input.startDate,
      endDate: input.endDate,
      timeUnit: input.timeUnit,
      keywordGroups: input.keywords.map((keyword) => ({
        groupName: keyword,
        keywords: [keyword],
      })),
      ...(input.device ? { device: input.device } : {}),
      ...(input.gender ? { gender: input.gender } : {}),
      ...(input.ages?.length ? { ages: input.ages } : {}),
    };

    const response = await fetch(`${config.baseUrl}${SEARCH_TREND_URI}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Naver-Client-Id': config.clientId,
        'X-Naver-Client-Secret': config.clientSecret,
      },
      body: JSON.stringify(body),
    });

    const bodyText = await response.text();
    if (!response.ok) {
      throw new BadGatewayException(`네이버 DataLab API 호출 실패 (${response.status}): ${bodyText.slice(0, 300)}`);
    }

    try {
      return JSON.parse(bodyText) as NaverDatalabSearchTrendResponse;
    } catch {
      throw new BadGatewayException('네이버 DataLab API가 JSON이 아닌 응답을 반환했습니다.');
    }
  }

  private readConfig(): NaverDatalabConfig | null {
    const clientId = process.env.NAVER_DATALAB_CLIENT_ID?.trim();
    const clientSecret = process.env.NAVER_DATALAB_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) return null;
    return {
      clientId,
      clientSecret,
      baseUrl: process.env.NAVER_DATALAB_BASE_URL?.trim() || DEFAULT_BASE_URL,
    };
  }
}

function normalizeKeywords(keywords: string[]): string[] {
  return Array.from(new Set(
    keywords
      .map((keyword) => keyword.trim())
      .filter(Boolean),
  )).slice(0, MAX_KEYWORDS_PER_RANKING);
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function resolveDateRange(startDate?: string, endDate?: string): { startDate: string; endDate: string } {
  const fallback = defaultDateRange();
  return {
    startDate: startDate ?? fallback.startDate,
    endDate: endDate ?? fallback.endDate,
  };
}

function defaultDateRange(now = new Date()): { startDate: string; endDate: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 30);
  return {
    startDate: formatDate(start),
    endDate: formatDate(end),
  };
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function mapTrendResult(result: NonNullable<NaverDatalabSearchTrendResponse['results']>[number]): NaverDatalabKeywordTrend {
  const data = (result.data ?? [])
    .map((point) => ({
      period: String(point.period ?? ''),
      ratio: typeof point.ratio === 'number' && Number.isFinite(point.ratio) ? point.ratio : 0,
    }))
    .filter((point) => point.period);
  const latestRatio = data.at(-1)?.ratio ?? 0;
  const previous = data.slice(0, -1);
  const previousAverageRatio = previous.length === 0
    ? 0
    : previous.reduce((sum, point) => sum + point.ratio, 0) / previous.length;
  const peakRatio = data.reduce((peak, point) => Math.max(peak, point.ratio), 0);
  const trendDelta = latestRatio - previousAverageRatio;
  const trendRate = previousAverageRatio > 0 ? trendDelta / previousAverageRatio : null;

  return {
    keyword: String(result.title ?? result.keywords?.[0] ?? '').trim(),
    latestRatio: roundRatio(latestRatio),
    previousAverageRatio: roundRatio(previousAverageRatio),
    peakRatio: roundRatio(peakRatio),
    trendDelta: roundRatio(trendDelta),
    trendRate: trendRate == null ? null : roundRatio(trendRate),
    data,
  };
}

function compareTrends(a: NaverDatalabKeywordTrend, b: NaverDatalabKeywordTrend): number {
  return (
    b.trendDelta - a.trendDelta ||
    (b.trendRate ?? -999) - (a.trendRate ?? -999) ||
    b.latestRatio - a.latestRatio ||
    a.keyword.localeCompare(b.keyword, 'ko')
  );
}

function roundRatio(value: number): number {
  return Math.round(value * 100) / 100;
}
