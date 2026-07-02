import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import type {
  NaverKeywordResearchPort,
  NaverKeywordResearchStatus,
  NaverRelatedKeyword,
  SearchNaverRelatedKeywordsInput,
  SearchNaverRelatedKeywordsResult,
} from '../../../application/port/out/provider/naver-keyword-research.port';

const REQUIRED_ENV = [
  'NAVER_SEARCHAD_API_KEY',
  'NAVER_SEARCHAD_SECRET_KEY',
  'NAVER_SEARCHAD_CUSTOMER_ID',
];
const DEFAULT_BASE_URL = 'https://api.searchad.naver.com';
const KEYWORD_TOOL_URI = '/keywordstool';

interface NaverSearchAdKeywordToolResponse {
  keywordList?: Record<string, unknown>[];
}

interface NaverSearchAdConfig {
  apiKey: string;
  secretKey: string;
  customerId: string;
  baseUrl: string;
}

@Injectable()
export class NaverSearchAdKeywordAdapter implements NaverKeywordResearchPort {
  getStatus(): NaverKeywordResearchStatus {
    return {
      configured: this.readConfig() !== null,
      requiredEnv: REQUIRED_ENV,
    };
  }

  async searchRelatedKeywords(input: SearchNaverRelatedKeywordsInput): Promise<SearchNaverRelatedKeywordsResult> {
    const config = this.readConfig();
    if (!config) {
      throw new ServiceUnavailableException(
        '네이버 검색광고 API 키가 설정되지 않았습니다. apps/server/.env에 NAVER_SEARCHAD_API_KEY, NAVER_SEARCHAD_SECRET_KEY, NAVER_SEARCHAD_CUSTOMER_ID를 설정해주세요.',
      );
    }

    const seedKeywords = normalizeSeedKeywords(input.seedKeywords);
    if (seedKeywords.length === 0) {
      return {
        source: 'naver-searchad-keywordstool',
        seedKeywords,
        generatedAt: new Date().toISOString(),
        items: [],
      };
    }

    const maxResults = clamp(input.maxResults ?? 50, 1, 100);
    const params = new URLSearchParams({
      hintKeywords: seedKeywords.join(','),
      showDetail: '1',
    });
    const timestamp = Date.now().toString();
    const signature = createNaverSearchAdSignature(timestamp, 'GET', KEYWORD_TOOL_URI, config.secretKey);
    const response = await fetch(`${config.baseUrl}${KEYWORD_TOOL_URI}?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Timestamp': timestamp,
        'X-API-KEY': config.apiKey,
        'X-Customer': config.customerId,
        'X-Signature': signature,
      },
    });

    const bodyText = await response.text();
    if (!response.ok) {
      throw new BadGatewayException(`네이버 검색광고 API 호출 실패 (${response.status}): ${bodyText.slice(0, 300)}`);
    }

    let body: NaverSearchAdKeywordToolResponse;
    try {
      body = JSON.parse(bodyText) as NaverSearchAdKeywordToolResponse;
    } catch {
      throw new BadGatewayException('네이버 검색광고 API가 JSON이 아닌 응답을 반환했습니다.');
    }

    const items = (body.keywordList ?? [])
      .map(mapNaverKeyword)
      .sort(compareNaverKeywords)
      .slice(0, maxResults);

    return {
      source: 'naver-searchad-keywordstool',
      seedKeywords,
      generatedAt: new Date().toISOString(),
      items,
    };
  }

  private readConfig(): NaverSearchAdConfig | null {
    const apiKey = process.env.NAVER_SEARCHAD_API_KEY?.trim();
    const secretKey = process.env.NAVER_SEARCHAD_SECRET_KEY?.trim();
    const customerId = process.env.NAVER_SEARCHAD_CUSTOMER_ID?.trim();
    if (!apiKey || !secretKey || !customerId) return null;
    return {
      apiKey,
      secretKey,
      customerId,
      baseUrl: process.env.NAVER_SEARCHAD_BASE_URL?.trim() || DEFAULT_BASE_URL,
    };
  }
}

export function createNaverSearchAdSignature(
  timestamp: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  uri: string,
  secretKey: string,
): string {
  return createHmac('sha256', secretKey)
    .update(`${timestamp}.${method}.${uri}`, 'utf8')
    .digest('base64');
}

function normalizeSeedKeywords(seedKeywords: string[]): string[] {
  return Array.from(new Set(
    seedKeywords
      .map((keyword) => keyword.trim().replace(/\s+/g, ''))
      .filter(Boolean),
  )).slice(0, 5);
}

function mapNaverKeyword(row: Record<string, unknown>): NaverRelatedKeyword {
  const monthlyPcSearchCount = parseNaverNumber(row.monthlyPcQcCnt);
  const monthlyMobileSearchCount = parseNaverNumber(row.monthlyMobileQcCnt);
  const monthlyPcClickCount = parseNaverNumber(row.monthlyAvePcClkCnt);
  const monthlyMobileClickCount = parseNaverNumber(row.monthlyAveMobileClkCnt);

  return {
    keyword: String(row.relKeyword ?? '').trim(),
    monthlyPcSearchCount,
    monthlyMobileSearchCount,
    monthlyTotalSearchCount: sumNullable(monthlyPcSearchCount, monthlyMobileSearchCount),
    monthlyPcClickCount,
    monthlyMobileClickCount,
    monthlyTotalClickCount: sumNullable(monthlyPcClickCount, monthlyMobileClickCount),
    monthlyPcClickRate: parseNaverNumber(row.monthlyAvePcCtr),
    monthlyMobileClickRate: parseNaverNumber(row.monthlyAveMobileCtr),
    averageAdRank: parseNaverNumber(row.plAvgDepth),
    competitionIndex: typeof row.compIdx === 'string' ? row.compIdx : null,
    raw: row,
  };
}

function compareNaverKeywords(a: NaverRelatedKeyword, b: NaverRelatedKeyword): number {
  return (
    (b.monthlyTotalSearchCount ?? -1) - (a.monthlyTotalSearchCount ?? -1) ||
    (b.monthlyTotalClickCount ?? -1) - (a.monthlyTotalClickCount ?? -1) ||
    a.keyword.localeCompare(b.keyword, 'ko')
  );
}

function parseNaverNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('<')) return 0;
  const parsed = Number(trimmed.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function sumNullable(a: number | null, b: number | null): number | null {
  if (a == null && b == null) return null;
  return (a ?? 0) + (b ?? 0);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
