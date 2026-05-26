import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  type Search1688ImageInput,
  type Search1688ImageItem,
  type Search1688ImageResult,
  type Search1688ImageStatus,
  type Sourcing1688ImageSearchPort,
} from '../../../application/port/out/provider/1688-image-search.port';

const DEFAULT_TMAPI_BASE_URL = 'https://api.tmapi.top';
const REQUEST_TIMEOUT_MS = 15_000;

@Injectable()
export class Tmapi1688ImageSearchAdapter implements Sourcing1688ImageSearchPort {
  getStatus(): Search1688ImageStatus {
    return {
      configured: Boolean(readToken()),
      baseUrl: readBaseUrl(),
    };
  }

  async searchByImage(input: Search1688ImageInput): Promise<Search1688ImageResult> {
    const token = readToken();
    if (!token) {
      throw new ServiceUnavailableException('TMAPI_TOKEN is required for 1688 image search');
    }

    const baseUrl = readBaseUrl();
    const convertedImageUrl = await convertImageUrl({
      baseUrl,
      token,
      imageUrl: input.imageUrl,
    });
    const searchImageUrl = convertedImageUrl || input.imageUrl;
    const url = new URL('/taobao/search/image', baseUrl);
    url.searchParams.set('apiToken', token);
    url.searchParams.set('img_url', searchImageUrl);
    url.searchParams.set('page', '1');

    const data = await fetchJson(url.toString());
    const items = normalizeItems(data, input.keyword)
      .slice(0, Math.max(1, Math.min(input.maxResults ?? 8, 20)));

    return {
      imageUrl: input.imageUrl,
      convertedImageUrl: convertedImageUrl || null,
      items,
    };
  }
}

async function convertImageUrl(input: {
  baseUrl: string;
  token: string;
  imageUrl: string;
}): Promise<string | null> {
  if (input.imageUrl.includes('alicdn.com') || input.imageUrl.includes('1688.com')) {
    return input.imageUrl;
  }

  try {
    const url = new URL('/tools/image-url-convert', input.baseUrl);
    const data = await fetchJson(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiToken: input.token, url: input.imageUrl }),
    });
    const converted = readString(data, ['data', 'url']);
    return converted || null;
  } catch {
    return null;
  }
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new BadGatewayException(`1688 image search request failed: ${errorMessage(error)}`);
  }

  if (!response.ok) {
    throw new BadGatewayException(`1688 image search upstream failed: ${response.status}`);
  }

  try {
    return await response.json();
  } catch {
    throw new BadGatewayException('1688 image search returned invalid JSON');
  }
}

function normalizeItems(data: unknown, keyword?: string): Search1688ImageItem[] {
  const items = readArray(data, ['data', 'items']);
  const keywordTokens = normalizeKeyword(keyword);

  return items
    .map((item) => normalizeItem(item, keywordTokens))
    .filter((item): item is Search1688ImageItem => item != null)
    .sort((a, b) => b.score - a.score);
}

function normalizeItem(value: unknown, keywordTokens: string[]): Search1688ImageItem | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const title = stringValue(record.title) || stringValue(record.name);
  const sourceUrl = stringValue(record.detail_url) || stringValue(record.item_url) || stringValue(record.url);
  if (!title || !sourceUrl) return null;

  const imageUrl = stringValue(record.pic_url) ||
    stringValue(record.image_url) ||
    stringValue(record.thumbnail) ||
    null;
  const priceCny = numberValue(record.price) ??
    numberValue(record.price_min) ??
    numberValue(record.sale_price);
  const score = calculateScore({ title, sourceUrl, imageUrl, priceCny, keywordTokens });

  return {
    title,
    priceCny,
    sourceUrl,
    imageUrl,
    score,
  };
}

function calculateScore(input: {
  title: string;
  sourceUrl: string;
  imageUrl: string | null;
  priceCny: number | null;
  keywordTokens: string[];
}): number {
  let score = 46;
  const normalizedTitle = input.title.toLowerCase();

  if (input.keywordTokens.length > 0) {
    const matched = input.keywordTokens.filter((token) => normalizedTitle.includes(token)).length;
    score += Math.round((matched / input.keywordTokens.length) * 28);
  }

  if (input.priceCny != null && input.priceCny > 0 && input.priceCny <= 300) score += 12;
  if (input.sourceUrl.includes('1688.com')) score += 8;
  if (input.imageUrl) score += 6;

  return Math.min(100, score);
}

function normalizeKeyword(keyword: string | undefined): string[] {
  if (!keyword) return [];
  return keyword
    .toLowerCase()
    .split(/[^a-z0-9가-힣]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function readBaseUrl(): string {
  return (process.env.TMAPI_BASE_URL || DEFAULT_TMAPI_BASE_URL).replace(/\/+$/, '');
}

function readToken(): string {
  return process.env.TMAPI_TOKEN?.trim() ?? '';
}

function readArray(value: unknown, path: string[]): unknown[] {
  let current = value;
  for (const segment of path) {
    if (!current || typeof current !== 'object') return [];
    current = (current as Record<string, unknown>)[segment];
  }
  return Array.isArray(current) ? current : [];
}

function readString(value: unknown, path: string[]): string | null {
  let current = value;
  for (const segment of path) {
    if (!current || typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[segment];
  }
  return stringValue(current) || null;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function numberValue(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
