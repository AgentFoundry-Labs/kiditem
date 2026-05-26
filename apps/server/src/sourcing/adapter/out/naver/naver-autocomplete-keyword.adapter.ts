import { BadGatewayException, Injectable } from '@nestjs/common';
import type {
  NaverAutocompleteKeyword,
  NaverAutocompleteKeywordPort,
  SearchNaverAutocompleteKeywordsInput,
  SearchNaverAutocompleteKeywordsResult,
} from '../../../application/port/out/provider/naver-keyword-research.port';

const DEFAULT_BASE_URL = 'https://ac.search.naver.com';
const AUTOCOMPLETE_URI = '/nx/ac';

interface NaverAutocompleteResponse {
  query?: unknown[];
  items?: unknown[];
}

@Injectable()
export class NaverAutocompleteKeywordAdapter implements NaverAutocompleteKeywordPort {
  async searchAutocompleteKeywords(
    input: SearchNaverAutocompleteKeywordsInput,
  ): Promise<SearchNaverAutocompleteKeywordsResult> {
    const keyword = input.keyword.trim();
    if (!keyword) {
      return {
        source: 'naver-search-autocomplete',
        keyword,
        generatedAt: new Date().toISOString(),
        items: [],
      };
    }

    const maxResults = clamp(input.maxResults ?? 20, 1, 50);
    const params = new URLSearchParams({
      q: keyword,
      con: '0',
      frm: 'nv',
      ans: '2',
      r_format: 'json',
      r_enc: 'UTF-8',
      r_unicode: '0',
      t_koreng: '1',
      run: '2',
      rev: '4',
      q_enc: 'UTF-8',
      st: '100',
    });
    const response = await fetch(`${readBaseUrl()}${AUTOCOMPLETE_URI}?${params.toString()}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json, text/plain, */*',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      },
    });

    const bodyText = await response.text();
    if (!response.ok) {
      throw new BadGatewayException(`네이버 자동완성 호출 실패 (${response.status}): ${bodyText.slice(0, 300)}`);
    }

    let body: NaverAutocompleteResponse;
    try {
      body = JSON.parse(bodyText) as NaverAutocompleteResponse;
    } catch {
      throw new BadGatewayException('네이버 자동완성이 JSON이 아닌 응답을 반환했습니다.');
    }

    return {
      source: 'naver-search-autocomplete',
      keyword,
      generatedAt: new Date().toISOString(),
      items: normalizeAutocompleteItems(body.items).slice(0, maxResults),
    };
  }
}

function normalizeAutocompleteItems(items: unknown): NaverAutocompleteKeyword[] {
  const seen = new Set<string>();
  const keywords: NaverAutocompleteKeyword[] = [];
  for (const candidate of flattenAutocompleteItems(items)) {
    const keyword = candidate.trim();
    const key = compactKeyword(keyword);
    if (!keyword || seen.has(key)) continue;
    seen.add(key);
    keywords.push({
      keyword,
      rank: keywords.length + 1,
      source: 'naver-search-autocomplete',
    });
  }
  return keywords;
}

function flattenAutocompleteItems(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      result.push(item);
      continue;
    }
    if (!Array.isArray(item)) continue;
    const first = item[0];
    if (typeof first === 'string') {
      result.push(first);
      continue;
    }
    result.push(...flattenAutocompleteItems(item));
  }
  return result;
}

function compactKeyword(keyword: string): string {
  return keyword.replace(/\s+/g, '').toLowerCase();
}

function readBaseUrl(): string {
  return process.env.NAVER_AUTOCOMPLETE_BASE_URL?.trim() || DEFAULT_BASE_URL;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
