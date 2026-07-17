import { createHash } from 'node:crypto';
import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
} from '@nestjs/common';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { matchStationeryToyTrend } from '../../../domain/stationery-toy-trend';
import type {
  FetchMarketShadowSignalsInput,
  FetchMarketShadowSignalsResult,
  MarketShadowSignalItem,
  MarketShadowSignalNewsItem,
  MarketShadowSignalPort,
} from '../../../application/port/out/provider/market-shadow-signal.port';

const GOOGLE_TRENDS_RSS_URL = 'https://trends.google.com/trending/rss?geo=KR';
const REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 100;

type XmlRecord = Record<string, unknown>;

@Injectable()
export class GoogleTrendsRssAdapter implements MarketShadowSignalPort {
  async fetchTrending(
    input: FetchMarketShadowSignalsInput,
  ): Promise<FetchMarketShadowSignalsResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(GOOGLE_TRENDS_RSS_URL, {
        method: 'GET',
        headers: {
          Accept: 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8',
        },
        redirect: 'follow',
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new BadGatewayException(
          `Google Trends RSS 요청에 실패했습니다 (HTTP ${response.status}).`,
        );
      }

      const xml = await response.text();
      const items = parseRssItems(xml, input.seedKeywords ?? [], resolveLimit(input.limit));
      return {
        source: 'google-trends-rss',
        generatedAt: new Date().toISOString(),
        items,
      };
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) {
        throw new GatewayTimeoutException(
          `Google Trends RSS 요청 시간이 ${REQUEST_TIMEOUT_MS}ms를 초과했습니다.`,
        );
      }
      if (error instanceof BadGatewayException) throw error;
      throw new BadGatewayException('Google Trends RSS 네트워크 요청에 실패했습니다.');
    } finally {
      clearTimeout(timeout);
    }
  }
}

function parseRssItems(
  xml: string,
  seedKeywords: readonly string[],
  limit: number,
): MarketShadowSignalItem[] {
  if (!xml.trim() || XMLValidator.validate(xml) !== true) {
    throw new BadGatewayException('Google Trends RSS가 유효한 XML을 반환하지 않았습니다.');
  }

  let parsed: unknown;
  try {
    parsed = new XMLParser({
      ignoreAttributes: false,
      parseTagValue: false,
      processEntities: true,
      trimValues: true,
    }).parse(xml);
  } catch {
    throw new BadGatewayException('Google Trends RSS XML을 해석할 수 없습니다.');
  }

  const rss = recordValue(parsed)?.rss;
  const channel = recordValue(rss)?.channel;
  if (!recordValue(channel)) {
    throw new BadGatewayException('Google Trends RSS 응답에 channel이 없습니다.');
  }

  const rawItems = arrayValue(recordValue(channel)?.item);
  const seen = new Set<string>();
  const items: MarketShadowSignalItem[] = [];
  for (const rawItem of rawItems) {
    const item = recordValue(rawItem);
    if (!item) continue;
    const normalized = normalizeItem(item, seedKeywords);
    if (!normalized || seen.has(normalized.externalId)) continue;
    seen.add(normalized.externalId);
    items.push(normalized);
    if (items.length >= limit) break;
  }
  return items;
}

function normalizeItem(
  raw: XmlRecord,
  seedKeywords: readonly string[],
): MarketShadowSignalItem | null {
  const rawTitle = stringValue(raw.title);
  if (!rawTitle) return null;

  const newsItems = arrayValue(raw['ht:news_item'])
    .map(recordValue)
    .filter((item): item is XmlRecord => item != null)
    .map(normalizeNewsItem)
    .filter((item) => item.title || item.url || item.source);
  const sourceUrl = newsItems.find((item) => item.url)?.url
    ?? normalizeHttpUrl(raw.link);
  const rawPublishedAt = stringValue(raw.pubDate);
  const publishedAt = normalizeIso(rawPublishedAt);
  const approximateTrafficLabel = stringValue(raw['ht:approx_traffic']);
  const relevanceLabel = matchStationeryToyTrend(
    [rawTitle, ...newsItems.map((item) => item.title)],
    seedKeywords,
  );

  return {
    externalId: stableExternalId(sourceUrl, rawTitle, publishedAt ?? rawPublishedAt),
    source: 'google-trends-rss',
    title: rawTitle,
    rawTitle,
    approximateTraffic: parseApproximateTraffic(approximateTrafficLabel),
    approximateTrafficLabel,
    publishedAt,
    sourceUrl,
    newsItems,
    relevanceLabel,
    raw: { ...raw },
  };
}

function normalizeNewsItem(raw: XmlRecord): MarketShadowSignalNewsItem {
  return {
    title: stringValue(raw['ht:news_item_title']),
    url: normalizeHttpUrl(raw['ht:news_item_url']),
    source: stringValue(raw['ht:news_item_source']),
  };
}

function stableExternalId(
  sourceUrl: string | null,
  title: string,
  publishedAt: string | null,
): string {
  const identity = sourceUrl
    ? `url:${sourceUrl}`
    : `title:${normalizeIdentityText(title)}\u001fdate:${publishedAt?.slice(0, 10) ?? ''}`;
  const digest = createHash('sha256').update(identity).digest('hex').slice(0, 24);
  return `gtr_${digest}`;
}

function normalizeIdentityText(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ko-KR');
}

function parseApproximateTraffic(value: string | null): number | null {
  if (!value) return null;
  const match = /^([0-9][0-9,.]*)(?:\s*)([kmb])?\+?$/i.exec(value.trim());
  if (!match) return null;
  const base = Number(match[1].replace(/,/g, ''));
  if (!Number.isFinite(base)) return null;
  const unit = match[2]?.toLowerCase();
  const multiplier = unit === 'b'
    ? 1_000_000_000
    : unit === 'm'
      ? 1_000_000
      : unit === 'k'
        ? 1_000
        : 1;
  return Math.round(base * multiplier);
}

function normalizeIso(value: string | null): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function normalizeHttpUrl(value: unknown): string | null {
  const text = stringValue(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function resolveLimit(value: number | undefined): number {
  if (value == null || !Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(value)));
}

function recordValue(value: unknown): XmlRecord | null {
  if (typeof value !== 'object' || value == null || Array.isArray(value)) return null;
  return value as XmlRecord;
}

function arrayValue(value: unknown): unknown[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
