import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import * as dns from 'node:dns/promises';
import { isIP } from 'node:net';
import { Agent } from 'undici';
import {
  PublicUrlError,
  assertPublicHttpUrl,
  assertPublicIpAddress,
} from '../../../../common/security/public-url';
import {
  type Search1688ImageInput,
  type Search1688ImageItem,
  type Search1688ImageResult,
  type Search1688ImageStatus,
  type Sourcing1688ImageSearchPort,
} from '../../../application/port/out/provider/1688-image-search.port';
import { Direct1688KeywordSearchAdapter } from './direct-1688-keyword-search.adapter';

const DEFAULT_1688_ALPHA_BASE_URL = 'https://overseaplugin.1688.com';
const DEFAULT_1688_ALPHA_SOURCE = 'www.coupang.com';
const DEFAULT_1688_ALPHA_TERMINAL_ID = 'Chrome_138.0.0.0';
const DEFAULT_1688_ALPHA_VERSION = '0.1.2';
const DEFAULT_1688_ALPHA_LANGUAGE = 'ko';
const DEFAULT_1688_ALPHA_CURRENCY = 'CNY';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_ALPHA_PAGE_SIZE = 18;
const MAX_IMAGE_REDIRECTS = 3;
const publicImageFetchDispatcher = new Agent({
  connect: {
    lookup: publicImageLookup,
  },
});

@Injectable()
export class Direct1688ImageSearchAdapter implements Sourcing1688ImageSearchPort {
  constructor(private readonly keywordSearch: Direct1688KeywordSearchAdapter) {}

  getStatus(): Search1688ImageStatus {
    return {
      configured: true,
      baseUrl: readAlphaBaseUrl(),
    };
  }

  async searchByImage(input: Search1688ImageInput): Promise<Search1688ImageResult> {
    const maxResults = clampInteger(input.maxResults ?? 12, 1, MAX_ALPHA_PAGE_SIZE);

    try {
      const uploadedImage = await uploadImageForAlphaSearch(input.imageUrl);
      const searchResult = await postAlphaJson<AlphaImageSearchResponse>('/alpha/imageSearch', {
        language: readAlphaLanguage(),
        currency: readAlphaCurrency(),
        imageUrl: uploadedImage.imageUrl,
        imageRegion: uploadedImage.currentRegion,
        platform: '1688',
        beginPage: 1,
        pageSize: maxResults,
      });

      return {
        imageUrl: input.imageUrl,
        convertedImageUrl: uploadedImage.imageUrl,
        items: normalizeAlphaItems(searchResult.data).slice(0, maxResults),
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;

      const keyword = input.keyword?.trim();
      if (!keyword) {
        throw new BadGatewayException(`1688 AlphaShop image search failed: ${errorMessage(error)}`);
      }

      return this.searchByKeywordFallback({
        imageUrl: input.imageUrl,
        keyword,
        maxResults,
      });
    }
  }

  private async searchByKeywordFallback(input: {
    imageUrl: string;
    keyword: string;
    maxResults: number;
  }): Promise<Search1688ImageResult> {
    const result = await this.keywordSearch.searchByKeyword({
      keyword: input.keyword,
      page: 1,
      maxResults: input.maxResults,
    });

    return {
      imageUrl: input.imageUrl,
      convertedImageUrl: null,
      items: result.items.map((item) => ({
        title: item.title,
        priceCny: item.priceCny,
        sourceUrl: item.sourceUrl,
        imageUrl: item.imageUrl,
        score: item.score,
        salesNum: item.monthlySales,
        salesText: item.monthlySales == null ? null : String(item.monthlySales),
        supplierName: item.supplierName,
        repurchaseRate: item.repurchaseRate,
      })),
    };
  }
}

interface AlphaUploadResponse {
  retCode?: unknown;
  retMsg?: unknown;
  success?: unknown;
  result?: unknown;
}

interface AlphaImageSearchResponse {
  retCode?: unknown;
  retMsg?: unknown;
  success?: unknown;
  data?: unknown;
}

interface AlphaUploadedImage {
  imageUrl: string;
  currentRegion: string;
  yoloCropRegion: string | null;
}

async function uploadImageForAlphaSearch(imageUrl: string): Promise<AlphaUploadedImage> {
  const imageBase64 = await fetchImageAsDataUrl(imageUrl);
  const payload = await postAlphaJson<AlphaUploadResponse>('/image/uploadV2', {
    imageBase64,
    regionRecognition: true,
  });
  const result = isRecord(payload.result) ? payload.result : null;
  const uploadedImageUrl = stringValue(result?.imageUrl);
  const currentRegion = stringValue(result?.currentRegion);
  const yoloCropRegion = stringValue(result?.yoloCropRegion);

  if (!uploadedImageUrl || !currentRegion) {
    throw new BadGatewayException('1688 AlphaShop image upload did not return an image region');
  }

  return {
    imageUrl: uploadedImageUrl,
    currentRegion,
    yoloCropRegion,
  };
}

async function fetchImageAsDataUrl(imageUrl: string): Promise<string> {
  const value = imageUrl.trim();
  if (!value) throw new BadRequestException('imageUrl is required');
  if (/^data:image\//i.test(value)) return value;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new BadRequestException('imageUrl must be an absolute URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new BadRequestException('imageUrl must use http or https');
  }

  const { response, finalUrl } = await fetchPublicImageResponse(parsed);
  if (!response.ok) {
    throw new BadGatewayException(`image download failed: ${response.status}`);
  }

  const bytes = await readResponseBytes(response);
  const contentType = normalizeImageContentType(response.headers.get('content-type')) ||
    inferImageContentType(finalUrl.pathname) ||
    'image/jpeg';

  return `data:${contentType};base64,${bytes.toString('base64')}`;
}

async function fetchPublicImageResponse(initialUrl: URL): Promise<{
  response: Response;
  finalUrl: URL;
}> {
  let currentUrl = initialUrl;

  for (let redirectCount = 0; redirectCount <= MAX_IMAGE_REDIRECTS; redirectCount += 1) {
    await assertSafeImageFetchUrl(currentUrl);

    let response: Response;
    try {
      response = await fetch(currentUrl.toString(), {
        headers: {
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          'User-Agent': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari/537.36',
        },
        dispatcher: publicImageFetchDispatcher,
        redirect: 'manual',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      } as RequestInit & { dispatcher: Agent });
    } catch (error) {
      throw new BadGatewayException(`image download failed: ${errorMessage(error)}`);
    }

    if (!isRedirectStatus(response.status)) return { response, finalUrl: currentUrl };

    const location = response.headers.get('location');
    if (!location) {
      throw new BadGatewayException(`image download redirect missing location: ${response.status}`);
    }
    if (redirectCount === MAX_IMAGE_REDIRECTS) {
      throw new BadRequestException('imageUrl has too many redirects');
    }

    try {
      currentUrl = new URL(location, currentUrl);
    } catch {
      throw new BadRequestException('imageUrl redirect location is invalid');
    }
  }

  throw new BadRequestException('imageUrl has too many redirects');
}

type PublicImageLookupOptions = {
  all?: boolean;
  family?: number;
  hints?: number;
  verbatim?: boolean;
};

type PublicImageLookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | Array<{ address: string; family: number }>,
  family?: number,
) => void;

function publicImageLookup(
  hostname: string,
  options: PublicImageLookupOptions,
  callback: PublicImageLookupCallback,
): void {
  void (async () => {
    try {
      const records = await resolvePublicHostAddresses(hostname, options.family);
      if (options.all) {
        callback(null, records);
        return;
      }

      const record = records.find((entry) => matchesLookupFamily(entry, options.family)) ?? records[0];
      callback(null, record.address, record.family);
    } catch (error) {
      callback(toLookupError(error), []);
    }
  })();
}

async function assertSafeImageFetchUrl(url: URL): Promise<void> {
  try {
    assertPublicHttpUrl(url.toString());
  } catch (error) {
    if (error instanceof PublicUrlError) {
      throw new BadRequestException('imageUrl host is not allowed');
    }
    throw error;
  }

  const host = normalizeLookupHost(url.hostname);
  await resolvePublicHostAddresses(host);
}

async function resolvePublicHostAddresses(
  hostname: string,
  family?: number,
): Promise<Array<{ address: string; family: number }>> {
  const host = normalizeLookupHost(hostname);
  const ipFamily = isIP(host);
  if (ipFamily !== 0) {
    assertPublicIpAddressOrBadRequest(host);
    return [{ address: host, family: ipFamily }];
  }

  let records: Array<{ address: string; family: number }>;
  try {
    records = await dns.lookup(host, { all: true, family, verbatim: true });
  } catch (error) {
    throw new BadGatewayException(`image host lookup failed: ${errorMessage(error)}`);
  }

  const matchingRecords = records.filter((record) => matchesLookupFamily(record, family));
  if (matchingRecords.length === 0) {
    throw new BadGatewayException('image host lookup returned no addresses');
  }

  for (const record of matchingRecords) {
    assertPublicIpAddressOrBadRequest(record.address);
  }

  return matchingRecords;
}

function matchesLookupFamily(record: { family: number }, family: number | undefined): boolean {
  return family == null || family === 0 || record.family === family;
}

function assertPublicIpAddressOrBadRequest(address: string): void {
  try {
    assertPublicIpAddress(address);
  } catch (error) {
    if (error instanceof PublicUrlError) {
      throw new BadRequestException('imageUrl host is not allowed');
    }
    throw error;
  }
}

function toLookupError(error: unknown): NodeJS.ErrnoException {
  if (error instanceof Error) return error as NodeJS.ErrnoException;
  return new Error(errorMessage(error)) as NodeJS.ErrnoException;
}

function normalizeLookupHost(hostname: string): string {
  let host = hostname.toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  const zoneIdx = host.indexOf('%');
  if (zoneIdx !== -1) host = host.slice(0, zoneIdx);
  return host.replace(/\.+$/, '');
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

async function readResponseBytes(response: Response): Promise<Buffer> {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
    throw new BadRequestException('imageUrl image is too large for 1688 AlphaShop search');
  }

  if (!response.body) {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_IMAGE_BYTES) {
      throw new BadRequestException('imageUrl image is too large for 1688 AlphaShop search');
    }
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > MAX_IMAGE_BYTES) {
        await reader.cancel();
        throw new BadRequestException('imageUrl image is too large for 1688 AlphaShop search');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, totalBytes);
}

async function postAlphaJson<T extends { retCode?: unknown; retMsg?: unknown; success?: unknown }>(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<T> {
  const url = `${readAlphaBaseUrl()}${endpoint}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      referrerPolicy: 'no-referrer',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source: readAlphaSource(),
        terminalId: readAlphaTerminalId(),
        version: readAlphaVersion(),
        ...body,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new BadGatewayException(`1688 AlphaShop request failed: ${errorMessage(error)}`);
  }

  if (!response.ok) {
    throw new BadGatewayException(`1688 AlphaShop upstream failed: ${response.status}`);
  }

  let payload: T;
  try {
    payload = await response.json() as T;
  } catch {
    throw new BadGatewayException('1688 AlphaShop returned invalid JSON');
  }

  if (!isAlphaSuccess(payload)) {
    throw new BadGatewayException(`1688 AlphaShop failed: ${alphaErrorMessage(payload)}`);
  }

  return payload;
}

function normalizeAlphaItems(value: unknown): Search1688ImageItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => normalizeAlphaItem(item, index))
    .filter((item): item is Search1688ImageItem => item != null);
}

function normalizeAlphaItem(value: unknown, index: number): Search1688ImageItem | null {
  if (!isRecord(value)) return null;
  const title = stringValue(value.title);
  const offerId = stringValue(value.itemId);
  const sourceUrl = (offerId ? canonicalOfferUrl(offerId) : null) ||
    stringValue(value.offerDetailUrl) ||
    stringValue(value.link) ||
    null;

  if (!title || !sourceUrl) return null;

  const imageUrl = stringValue(value.imageUrl);
  const priceCny = numberValue(value.itemPrice);
  const salesText = stringValue(value.sales) ||
    readMetricValue(value.salesInfos, 'o-xl') ||
    null;
  const salesNum = numberValue(value.salesNum);
  const providerInfo = isRecord(value.providerInfo) ? value.providerInfo : null;
  const providerTags = providerInfo && Array.isArray(providerInfo.providerTags)
    ? providerInfo.providerTags
      .map((tag) => isRecord(tag) ? stringValue(tag.tagName) : null)
      .filter((tag): tag is string => tag != null)
    : [];
  const supplierTags = [
    ...providerTags,
    ...stringArrayValue(value.providerKjCustomTags),
  ];
  const purchaseTags = [
    ...stringArrayValue(value.purchaseTags),
    ...readMetricValues(value.purchaseInfos)
      .filter((info) => info.code === 'o-fw')
      .map((info) => info.value),
  ].filter(uniqueString);
  const serviceScore = readMetricOriginValue(value.providerServices, 'p-fwf') ??
    readMetricOriginValue(value.largeImageExtraInfos, 'p-fwf');
  const repurchaseRate = readMetricValue(value.providerServices, 'p-htl') ??
    readMetricValue(value.largeImageBaseInfos, 'p-htl');

  return {
    title,
    priceCny,
    sourceUrl,
    imageUrl,
    salesText,
    salesNum,
    supplierName: stringValue(providerInfo?.companyName),
    supplierFactoryUrl: stringValue(providerInfo?.factoryUrl),
    supplierTags,
    purchaseTags,
    minOrderQuantity: readMetricOriginValue(value.purchaseInfos, 'o-qpl'),
    shippingFulfillmentRate: readMetricValue(value.shipInfos, 'o-lyl'),
    shippingPickupRate: readMetricValue(value.shipInfos, 'o-lsl') ??
      readMetricValue(value.largeImageBaseInfos, 'shipTime'),
    shipFrom: readMetricValue(value.shipInfos, 'fhd') ??
      readMetricValue(value.largeImageBaseInfos, 'fhd'),
    serviceScore,
    repurchaseRate,
    score: calculateAlphaScore({
      index,
      imageUrl,
      priceCny,
      salesNum,
      serviceScore,
    }),
  };
}

function calculateAlphaScore(input: {
  index: number;
  imageUrl: string | null;
  priceCny: number | null;
  salesNum: number | null;
  serviceScore: number | null;
}): number {
  let score = 92 - Math.min(24, input.index * 2);
  if (input.imageUrl) score += 2;
  if (input.priceCny != null && input.priceCny > 0) score += 2;
  if (input.salesNum != null && input.salesNum > 0) {
    score += Math.min(6, Math.round(Math.log10(input.salesNum + 1) * 2));
  }
  if (input.serviceScore != null) score += Math.round(input.serviceScore);
  return Math.max(40, Math.min(100, score));
}

function readMetricValues(value: unknown): Array<{ code: string | null; value: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const metricValue = stringValue(item.value);
    if (!metricValue) return [];
    return [{
      code: stringValue(item.code),
      value: metricValue,
    }];
  });
}

function readMetricValue(value: unknown, code: string): string | null {
  return readMetricValues(value).find((item) => item.code === code)?.value ?? null;
}

function readMetricOriginValue(value: unknown, code: string): number | null {
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    if (!isRecord(item)) continue;
    if (stringValue(item.code) !== code) continue;
    return numberValue(item.originValue);
  }
  return null;
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => stringValue(item)).filter((item): item is string => item != null)
    : [];
}

function uniqueString(value: string, index: number, array: string[]): boolean {
  return array.indexOf(value) === index;
}

function isAlphaSuccess(payload: {
  retCode?: unknown;
  success?: unknown;
}): boolean {
  return payload.success === true || payload.retCode === 'S0000';
}

function alphaErrorMessage(payload: {
  retCode?: unknown;
  retMsg?: unknown;
}): string {
  const message = Array.isArray(payload.retMsg) ? payload.retMsg.join(', ') : stringValue(payload.retMsg);
  return message || stringValue(payload.retCode) || 'unknown error';
}

function normalizeImageContentType(value: string | null): string | null {
  const contentType = value?.split(';')[0]?.trim().toLowerCase();
  return contentType?.startsWith('image/') ? contentType : null;
}

function inferImageContentType(pathname: string): string | null {
  const normalized = pathname.toLowerCase();
  if (normalized.endsWith('.png')) return 'image/png';
  if (normalized.endsWith('.webp')) return 'image/webp';
  if (normalized.endsWith('.gif')) return 'image/gif';
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) return 'image/jpeg';
  return null;
}

function canonicalOfferUrl(offerId: string): string {
  return `https://detail.1688.com/offer/${offerId}.html`;
}

function readAlphaBaseUrl(): string {
  return (process.env.DIRECT_1688_ALPHA_BASE_URL || DEFAULT_1688_ALPHA_BASE_URL).replace(/\/+$/, '');
}

function readAlphaSource(): string {
  return process.env.DIRECT_1688_ALPHA_SOURCE?.trim() || DEFAULT_1688_ALPHA_SOURCE;
}

function readAlphaTerminalId(): string {
  return process.env.DIRECT_1688_ALPHA_TERMINAL_ID?.trim() || DEFAULT_1688_ALPHA_TERMINAL_ID;
}

function readAlphaVersion(): string {
  return process.env.DIRECT_1688_ALPHA_VERSION?.trim() || DEFAULT_1688_ALPHA_VERSION;
}

function readAlphaLanguage(): string {
  return process.env.DIRECT_1688_ALPHA_LANGUAGE?.trim() || DEFAULT_1688_ALPHA_LANGUAGE;
}

function readAlphaCurrency(): string {
  return process.env.DIRECT_1688_ALPHA_CURRENCY?.trim() || DEFAULT_1688_ALPHA_CURRENCY;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[^\d.-]/g, '');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
