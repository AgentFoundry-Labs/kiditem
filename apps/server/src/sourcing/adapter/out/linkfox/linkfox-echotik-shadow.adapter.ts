import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  LINKFOX_ECHOTIK_SUPPORTED_REGIONS,
  type FetchLinkfoxEchotikNewProductRankInput,
  type FetchLinkfoxEchotikNewProductRankResult,
  type LinkfoxEchotikRegion,
  type LinkfoxEchotikShadowPort,
  type LinkfoxEchotikShadowProduct,
} from '../../../application/port/out/provider/market-shadow-signal.port';

const LINKFOX_ECHOTIK_ENDPOINT =
  'https://tool-gateway.linkfox.com/echotik/listNewProductRank';
const REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 50;
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_IMAGE_URLS = 20;
const MAX_RAW_DEPTH = 4;
const MAX_RAW_OBJECT_KEYS = 64;
const MAX_RAW_ARRAY_ITEMS = 50;
const MAX_RAW_STRING_LENGTH = 2_048;
const SUPPORTED_REGIONS = new Set<string>(LINKFOX_ECHOTIK_SUPPORTED_REGIONS);

type JsonRecord = Record<string, unknown>;

@Injectable()
export class LinkfoxEchotikShadowAdapter implements LinkfoxEchotikShadowPort {
  async fetchNewProductRank(
    input: FetchLinkfoxEchotikNewProductRankInput,
  ): Promise<FetchLinkfoxEchotikNewProductRankResult> {
    const apiKey = readApiKey();
    const date = resolveDate(input.date);
    const region = resolveRegion(input.region);
    const pageSize = resolvePageSize(input.pageSize);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(LINKFOX_ECHOTIK_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ date, region, pageNum: 1, pageSize }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw upstreamHttpError(response.status);
      }

      const bodyText = await response.text();
      if (Buffer.byteLength(bodyText, 'utf8') > MAX_RESPONSE_BYTES) {
        throw new BadGatewayException(
          'LinkFox EchoTik 응답이 허용된 크기를 초과했습니다.',
        );
      }
      const parsed = parseResponse(bodyText);
      assertSuccessfulBusinessCode(parsed);

      const products = arrayValue(parsed.products)
        .map(recordValue)
        .filter((product): product is JsonRecord => product != null)
        .slice(0, pageSize)
        .map((product) => normalizeProduct(product, region));

      return {
        source: 'linkfox-echotik-new-product-rank',
        generatedAt: new Date().toISOString(),
        date,
        region,
        pageSize,
        total: numberValue(parsed.total),
        costToken: numberValue(parsed.costToken),
        products,
      };
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) {
        throw new GatewayTimeoutException(
          `LinkFox EchoTik 요청 시간이 ${REQUEST_TIMEOUT_MS}ms를 초과했습니다.`,
        );
      }
      if (error instanceof HttpException) throw error;
      throw new BadGatewayException(
        'LinkFox EchoTik 네트워크 요청에 실패했습니다.',
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

function readApiKey(): string {
  const apiKey = process.env.LINKFOX_AGENT_API_KEY?.trim();
  if (!apiKey) {
    throw new ServiceUnavailableException(
      'LinkFox EchoTik을 사용하려면 LINKFOX_AGENT_API_KEY 설정이 필요합니다.',
    );
  }
  return apiKey;
}

function resolveDate(value: string): string {
  const date = value?.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new BadRequestException('LinkFox EchoTik date는 YYYY-MM-DD 형식이어야 합니다.');
  }
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new BadRequestException('LinkFox EchoTik date가 유효한 날짜가 아닙니다.');
  }
  return date;
}

function resolveRegion(value: string): LinkfoxEchotikRegion {
  const region = value?.trim().toUpperCase();
  if (!SUPPORTED_REGIONS.has(region)) {
    throw new BadRequestException(
      `LinkFox EchoTik region은 다음 중 하나여야 합니다: ${LINKFOX_ECHOTIK_SUPPORTED_REGIONS.join(', ')}.`,
    );
  }
  return region as LinkfoxEchotikRegion;
}

function resolvePageSize(value: number | undefined): number {
  if (value == null) return DEFAULT_PAGE_SIZE;
  if (!Number.isFinite(value) || value <= 0) {
    throw new BadRequestException('LinkFox EchoTik pageSize는 양수여야 합니다.');
  }
  return Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(value)));
}

function upstreamHttpError(status: number): BadGatewayException {
  if (status === 401) {
    return new BadGatewayException('LinkFox EchoTik 인증에 실패했습니다 (HTTP 401).');
  }
  if (status === 402) {
    return new BadGatewayException('LinkFox EchoTik 포인트가 부족합니다 (HTTP 402).');
  }
  return new BadGatewayException(
    `LinkFox EchoTik 요청에 실패했습니다 (HTTP ${status}).`,
  );
}

function parseResponse(bodyText: string): JsonRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    throw new BadGatewayException('LinkFox EchoTik이 JSON이 아닌 응답을 반환했습니다.');
  }
  const response = recordValue(parsed);
  if (!response) {
    throw new BadGatewayException('LinkFox EchoTik 응답 형식이 올바르지 않습니다.');
  }
  return response;
}

function assertSuccessfulBusinessCode(response: JsonRecord): void {
  const codes = [response.errorCode, response.errcode]
    .filter((value) => value != null)
    .map(normalizeBusinessCode);
  if (codes.length > 0 && codes.every((code) => code === 200)) return;

  const code = codes.find((candidate) => candidate !== 200) ?? codes[0] ?? null;
  if (code === 401) {
    throw new BadGatewayException('LinkFox EchoTik 인증에 실패했습니다 (code 401).');
  }
  if (code === 402) {
    throw new BadGatewayException('LinkFox EchoTik 포인트가 부족합니다 (code 402).');
  }
  throw new BadGatewayException(
    code == null
      ? 'LinkFox EchoTik 응답에 성공 코드가 없습니다.'
      : `LinkFox EchoTik 비즈니스 요청에 실패했습니다 (code ${code}).`,
  );
}

function normalizeBusinessCode(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return Number(value.trim());
  }
  return null;
}

function normalizeProduct(
  raw: JsonRecord,
  requestedRegion: LinkfoxEchotikRegion,
): LinkfoxEchotikShadowProduct {
  return {
    asin: firstString(raw.asin, raw.productId),
    title: firstString(raw.title, raw.productTitle),
    region: normalizeProductRegion(raw.region) ?? requestedRegion,
    price: firstNumber(raw.price, raw.avgPrice),
    minPrice: firstNumber(raw.minPrice, raw.minimumPrice),
    maxPrice: firstNumber(raw.maxPrice, raw.maximumPrice),
    currency: firstString(raw.currency, raw.currencyCode),
    totalSaleCnt: firstNumber(raw.totalSaleCnt, raw.totalSales),
    totalSale30dCnt: firstNumber(raw.totalSale30dCnt, raw.sales30d),
    gmv: firstNumber(raw.totalSaleGmvAmt, raw.gmv, raw.totalGmv),
    salesTrendFlagText: firstString(
      raw.salesTrendFlagText,
      raw.salesTrend,
    ) ?? numberAsString(raw.salesTrendFlagText, raw.salesTrend),
    videoCount: firstNumber(raw.totalVideoCnt, raw.videoCount),
    liveCount: firstNumber(raw.totalLiveCnt, raw.liveCount),
    influencerCount: firstNumber(raw.totalIflCnt, raw.influencerCount),
    commission: firstNumber(raw.productCommissionRate, raw.commission),
    rating: firstNumber(raw.productRating, raw.rating),
    reviewCount: firstNumber(raw.reviewCount, raw.reviews),
    availableDate: firstString(raw.availableDate, raw.firstSeenDate),
    categoryId: firstString(raw.categoryId, raw.category),
    imageUrls: normalizeImageUrls(raw),
    raw: boundedRawRecord(raw),
  };
}

function normalizeProductRegion(value: unknown): LinkfoxEchotikRegion | null {
  const region = stringValue(value)?.toUpperCase();
  return region && SUPPORTED_REGIONS.has(region)
    ? region as LinkfoxEchotikRegion
    : null;
}

function normalizeImageUrls(raw: JsonRecord): string[] {
  const candidates = [
    ...arrayValue(raw.productImageUrls),
    ...arrayValue(raw.imageUrls),
    raw.imageUrl,
  ];
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const url = normalizeHttpUrl(candidate);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
    if (urls.length >= MAX_IMAGE_URLS) break;
  }
  return urls;
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

function boundedRawRecord(raw: JsonRecord): JsonRecord {
  const bounded = boundedJsonValue(raw, 0);
  return recordValue(bounded) ?? {};
}

function boundedJsonValue(value: unknown, depth: number): unknown {
  if (value == null || typeof value === 'boolean' || typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') return value.slice(0, MAX_RAW_STRING_LENGTH);
  if (depth >= MAX_RAW_DEPTH) return null;
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_RAW_ARRAY_ITEMS)
      .map((item) => boundedJsonValue(item, depth + 1));
  }
  const record = recordValue(value);
  if (!record) return null;
  return Object.fromEntries(
    Object.entries(record)
      .slice(0, MAX_RAW_OBJECT_KEYS)
      .map(([key, item]) => [key, boundedJsonValue(item, depth + 1)]),
  );
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = stringValue(value);
    if (normalized) return normalized;
  }
  return null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberAsString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const normalized = numberValue(value);
    if (normalized != null) return normalized;
  }
  return null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/,/g, '').replace(/%$/, '');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function recordValue(value: unknown): JsonRecord | null {
  if (typeof value !== 'object' || value == null || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function arrayValue(value: unknown): unknown[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
