import { BadGatewayException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import {
  type Search1688KeywordInput,
  type Search1688KeywordItem,
  type Search1688KeywordResult,
  type Search1688KeywordStatus,
  type Sourcing1688KeywordSearchPort,
} from '../../../application/port/out/provider/1688-keyword-search.port';

const DEFAULT_1688_MTOP_BASE_URL = 'https://h5api.m.1688.com';
const MTOP_API = 'mtop.relationrecommend.WirelessRecommend.recommend';
const MTOP_APP_KEY = '12574478';
const MTOP_APP_ID = '32517';
const REQUEST_TIMEOUT_MS = 15_000;
const SEARCH_NAVIGATE_TIMEOUT_MS = 30_000;
const SEARCH_RENDER_WAIT_MS = 4_000;
const DEFAULT_USER_DATA_DIR = '.kiditem/playwright/sourcing';
const SEARCH_PAGE_BASE_URL = 'https://s.1688.com/selloffer/offer_search.htm';
const EXTRACT_1688_SEARCH_ITEMS = `(keyword) => {
  const normalizeUrl = (value) => {
    if (!value) return null;
    if (value.startsWith('//')) return 'https:' + value;
    if (value.startsWith('/')) return new URL(value, window.location.origin).toString();
    return value;
  };
  const offerIdFromUrl = (value) =>
    (/offer(?:detail)?\\/(\\d+)\\.html/.exec(value) || [])[1] ||
    (/offerId=(\\d+)/.exec(value) || [])[1] ||
    null;
  const cleanText = (value) => (value || '').replace(/\\s+/g, ' ').trim();
  const numberFromText = (value) => {
    const text = cleanText(value);
    const match = /(\\d+(?:\\.\\d+)?)/.exec(text);
    if (!match) return null;
    const parsed = Number(match[1]);
    if (!Number.isFinite(parsed)) return null;
    return /万/.test(text) ? Math.round(parsed * 10000) : parsed;
  };
  const findNearbyCard = (anchor) => {
    let current = anchor;
    for (let depth = 0; depth < 5 && current && current.parentElement; depth += 1) {
      current = current.parentElement;
      const text = cleanText(current.innerText);
      const imageCount = current.querySelectorAll('img').length;
      if (imageCount > 0 && text.length > 12) return current;
    }
    return anchor;
  };
  const keywordTokens = keyword
    .toLowerCase()
    .split(/[^a-z0-9가-힣\\u4e00-\\u9fff]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
  const candidates = Array.from(document.querySelectorAll('a[href]'))
    .filter((anchor) => {
      const href = normalizeUrl(anchor.getAttribute('href')) || '';
      return /1688\\.com\\/offer(?:detail)?\\/\\d+\\.html/.test(href) || /offerId=\\d+/.test(href);
    });
  const seen = new Set();
  const rows = [];

  for (const anchor of candidates) {
    const sourceUrl = normalizeUrl(anchor.getAttribute('href'));
    if (!sourceUrl) continue;
    const offerId = offerIdFromUrl(sourceUrl);
    const canonicalUrl = offerId ? 'https://detail.1688.com/offer/' + offerId + '.html' : sourceUrl;
    if (seen.has(canonicalUrl)) continue;

    const card = findNearbyCard(anchor);
    const image = card.querySelector('img[src], img[data-src], img[data-lazy-src]');
    const imageUrl = normalizeUrl(
      (image && (image.getAttribute('src') || image.getAttribute('data-src') || image.getAttribute('data-lazy-src'))) || null,
    );
    const title = cleanText(
      anchor.getAttribute('title') ||
      anchor.getAttribute('aria-label') ||
      (image && image.getAttribute('alt')) ||
      anchor.innerText,
    );
    if (!title || title.length < 2) continue;

    const cardText = cleanText(card.innerText);
    const priceText = (/(?:¥|￥|价格|起批价|元)\\s*[\\d.]+|[\\d.]+\\s*(?:元|¥|￥)/.exec(cardText) || [])[0] || null;
    const salesText = (/(?:成交|已售|月销|付款|采购)\\D{0,8}(\\d+(?:\\.\\d+)?万?)/.exec(cardText) || [])[0] || null;
    const repurchaseRate = (/(回头率|复购率)\\D{0,8}(\\d+(?:\\.\\d+)?%)/.exec(cardText) || [])[2] || null;
    const supplierNode = card.querySelector('[class*="company"], [class*="shop"], [class*="supplier"], [class*="seller"]');
    const supplierName = cleanText(supplierNode && supplierNode.innerText) || null;
    let score = 40;
    const normalizedTitle = title.toLowerCase();
    if (keywordTokens.length > 0) {
      const matched = keywordTokens.filter((token) => normalizedTitle.includes(token)).length;
      score += Math.round((matched / keywordTokens.length) * 24);
    }
    if (imageUrl) score += 6;
    if (numberFromText(priceText) != null) score += 10;
    if (numberFromText(salesText) != null) score += 8;

    rows.push({
      offerId,
      title,
      priceCny: numberFromText(priceText),
      sourceUrl: canonicalUrl,
      imageUrl,
      monthlySales: numberFromText(salesText),
      tradeScore: null,
      repurchaseRate,
      supplierName,
      score: Math.min(100, score),
    });
    seen.add(canonicalUrl);
  }

  return rows;
}`;

@Injectable()
export class Direct1688KeywordSearchAdapter implements Sourcing1688KeywordSearchPort {
  getStatus(): Search1688KeywordStatus {
    return {
      configured: true,
      baseUrl: readBaseUrl(),
    };
  }

  async searchByKeyword(input: Search1688KeywordInput): Promise<Search1688KeywordResult> {
    const page = clampInteger(input.page ?? 1, 1, 100);
    const maxResults = clampInteger(input.maxResults ?? 20, 1, 40);
    const mtop = await bootstrapMtopSession();
    const data = buildSearchData({
      keyword: input.keyword,
      page,
      pageSize: Math.min(Math.max(maxResults, 10), 40),
    });
    const url = buildMtopUrl({
      data,
      sign: signMtopRequest({
        token: mtop.token,
        timestamp: mtop.timestamp,
        data,
      }),
      timestamp: mtop.timestamp,
    });

    let items: Search1688KeywordItem[];
    try {
      const payload = await fetchMtopJson(url, {
        Cookie: mtop.cookieHeader,
      });
      assertMtopSuccess(payload);
      items = normalizeItems(payload, input.keyword).slice(0, maxResults);
    } catch (error) {
      if (!is1688UserValidateError(error)) throw error;
      items = await searchByKeywordWithBrowserFallback({
        keyword: input.keyword,
        page,
        maxResults,
      });
    }

    return {
      keyword: input.keyword,
      page,
      items,
    };
  }
}

interface MtopSession {
  cookieHeader: string;
  token: string;
  timestamp: string;
}

async function searchByKeywordWithBrowserFallback(input: {
  keyword: string;
  page: number;
  maxResults: number;
}): Promise<Search1688KeywordItem[]> {
  const userDataDir = resolveSourcingSearchUserDataDir();
  await mkdir(userDataDir, { recursive: true });
  const executablePath = resolveBrowserExecutablePath();
  const context = await chromium.launchPersistentContext(userDataDir, {
    ...(executablePath ? { executablePath } : {}),
    headless: resolveSourcingSearchHeadless(),
    viewport: { width: 1440, height: 1000 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = context.pages()[0] ?? await context.newPage();
    await page.goto(buildSearchPageUrl(input.keyword, input.page), {
      waitUntil: 'domcontentloaded',
      timeout: SEARCH_NAVIGATE_TIMEOUT_MS,
    });
    await page.waitForTimeout(SEARCH_RENDER_WAIT_MS);

    if (await is1688VerificationPage(page)) {
      throw new BadGatewayException(
        '1688 상품 검색이 로그인/사용자 검증 화면에서 막혔습니다. SOURCING_PLAYWRIGHT_HEADLESS=false로 서버를 띄운 뒤 1688 로그인/슬라이더 검증을 한 번 완료해주세요.',
      );
    }

    await page.evaluate('window.scrollTo(0, Math.min(document.documentElement.scrollHeight, 1800))');
    await page.waitForTimeout(800);

    const extracted = await page.evaluate(`(${EXTRACT_1688_SEARCH_ITEMS})(${JSON.stringify(input.keyword)})`);
    const items = Array.isArray(extracted) ? extracted : [];

    return items
      .map((item) => normalizeBrowserSearchItem(item, normalizeKeyword(input.keyword)))
      .filter((item): item is Search1688KeywordItem => item != null)
      .sort((a, b) => b.score - a.score)
      .slice(0, input.maxResults);
  } catch (error) {
    if (error instanceof BadGatewayException) throw error;
    throw new BadGatewayException(`1688 browser search failed: ${errorMessage(error)}`);
  } finally {
    await context.close();
  }
}

async function bootstrapMtopSession(): Promise<MtopSession> {
  const url = buildMtopUrl({
    data: '{}',
    sign: 'x',
    timestamp: String(Date.now()),
  });
  const response = await fetchMtopResponse(url);
  const setCookieHeaders = getSetCookieHeaders(response);
  const cookieHeader = setCookieHeaders
    .map((cookie) => cookie.split(';')[0]?.trim())
    .filter(Boolean)
    .join('; ');
  const tokenCookie = /(?:^|;\s*)_m_h5_tk=([^;]+)/.exec(cookieHeader)?.[1];
  const token = tokenCookie?.split('_')[0];

  if (!cookieHeader || !token) {
    throw new BadGatewayException('1688 keyword search did not return an mtop token');
  }

  return {
    cookieHeader,
    token,
    timestamp: String(Date.now()),
  };
}

function buildSearchData(input: {
  keyword: string;
  page: number;
  pageSize: number;
}): string {
  return JSON.stringify({
    appId: MTOP_APP_ID,
    params: JSON.stringify({
      keywords: input.keyword,
      beginPage: input.page,
      pageSize: input.pageSize,
      method: 'getOfferList',
      verticalProductFlag: 'pcmarket',
      searchScene: 'pcOfferSearch',
      charset: 'GBK',
    }),
  });
}

function buildMtopUrl(input: {
  data: string;
  sign: string;
  timestamp: string;
}): string {
  const url = new URL(`/h5/${MTOP_API.toLowerCase()}/2.0/`, readBaseUrl());
  url.searchParams.set('jsv', '2.5.1');
  url.searchParams.set('appKey', MTOP_APP_KEY);
  url.searchParams.set('t', input.timestamp);
  url.searchParams.set('sign', input.sign);
  url.searchParams.set('api', MTOP_API);
  url.searchParams.set('v', '2.0');
  url.searchParams.set('data', input.data);
  return url.toString();
}

function signMtopRequest(input: {
  token: string;
  timestamp: string;
  data: string;
}): string {
  return createHash('md5')
    .update(`${input.token}&${input.timestamp}&${MTOP_APP_KEY}&${input.data}`)
    .digest('hex');
}

async function fetchMtopJson(url: string, extraHeaders?: Record<string, string>): Promise<unknown> {
  const response = await fetchMtopResponse(url, extraHeaders);

  try {
    return await response.json();
  } catch {
    throw new BadGatewayException('1688 keyword search returned invalid JSON');
  }
}

async function fetchMtopResponse(url: string, extraHeaders?: Record<string, string>): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: 'application/json,text/plain,*/*',
        Origin: 'https://www.1688.com',
        Referer: 'https://www.1688.com/',
        'User-Agent': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari/537.36',
        ...extraHeaders,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new BadGatewayException(`1688 keyword search request failed: ${errorMessage(error)}`);
  }

  if (!response.ok) {
    throw new BadGatewayException(`1688 keyword search upstream failed: ${response.status}`);
  }

  return response;
}

function getSetCookieHeaders(response: Response): string[] {
  const maybeGetSetCookie = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof maybeGetSetCookie.getSetCookie === 'function') {
    return maybeGetSetCookie.getSetCookie();
  }
  const header = response.headers.get('set-cookie');
  return header ? splitCombinedSetCookie(header) : [];
}

function splitCombinedSetCookie(value: string): string[] {
  return value.split(/,\s*(?=[^;,]+=)/g);
}

function assertMtopSuccess(payload: unknown): void {
  const ret = readArray(payload, ['ret']);
  const first = typeof ret[0] === 'string' ? ret[0] : '';
  if (first.startsWith('FAIL_')) {
    throw new BadGatewayException(`1688 keyword search failed: ${first}`);
  }
}

async function is1688VerificationPage(page: Page): Promise<boolean> {
  const url = page.url();
  if (url.includes('/_____tmd_____/punish')) return true;
  if (url.includes('login.taobao.com') || url.includes('login.1688.com')) return true;
  const bodyText = await page.locator('body').innerText({ timeout: 2_000 }).catch(() => '');
  return bodyText.includes('밀어서 확인하기') ||
    bodyText.includes('Captcha Interception') ||
    bodyText.includes('unusual traffic') ||
    bodyText.includes('密码登录') ||
    bodyText.includes('扫码登录');
}

function normalizeItems(payload: unknown, keyword: string): Search1688KeywordItem[] {
  const items = firstArray(payload, [
    ['data', 'data', 'OFFER', 'items'],
    ['data', 'data', 'offerList'],
    ['data', 'data', 'items'],
    ['data', 'items'],
  ]);
  const keywordTokens = normalizeKeyword(keyword);

  return items
    .map((item) => normalizeItem(item, keywordTokens))
    .filter((item): item is Search1688KeywordItem => item != null)
    .sort((a, b) => b.score - a.score);
}

function normalizeItem(value: unknown, keywordTokens: string[]): Search1688KeywordItem | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const data = isRecord(record.data) ? record.data : record;
  const offerId = readFirstString(data, ['offerId', 'id']) || extractOfferId(readFirstString(data, ['linkUrl', 'url']) ?? '');
  const title = stripHtml(readFirstString(data, ['title', 'subject', 'name']) ?? '');
  const sourceUrl = canonicalOfferUrl(offerId, readFirstString(data, ['linkUrl', 'url']));

  if (!title || !sourceUrl) return null;

  const imageUrl = readFirstString(data, ['offerPicUrl', 'odPicUrl', 'imageUrl', 'picUrl']) ||
    readString(data, ['list', 'cover', 'pic']) ||
    null;
  const priceCny = readFirstNumber(data, ['price', 'priceValue']) ??
    readNumber(data, ['priceInfo', 'price']) ??
    readQuantityPrice(data);
  const monthlySales = readFirstNumber(data, ['bookedCount', 'monthSold']) ??
    readNumber(data, ['tradeInfo', 'tradeNumber']);
  const supplierName = readString(data, ['shopAddition', 'text']) ||
    readString(data, ['shop', 'text']) ||
    readString(data, ['company', 'name']) ||
    null;
  const repurchaseRate = readString(data, ['turnHead', 'percent']) || readRepurchaseRateFromTags(data);
  const tradeScore = readFirstNumber(data, ['rankgrade', 'qualityScore', 'score']);
  const score = calculateScore({
    title,
    sourceUrl,
    imageUrl,
    priceCny,
    monthlySales,
    keywordTokens,
  });

  return {
    offerId,
    title,
    priceCny,
    sourceUrl,
    imageUrl,
    monthlySales,
    tradeScore,
    repurchaseRate,
    supplierName,
    score,
  };
}

function normalizeBrowserSearchItem(value: unknown, keywordTokens: string[]): Search1688KeywordItem | null {
  if (!isRecord(value)) return null;
  const title = stringValue(value.title);
  const sourceUrl = stringValue(value.sourceUrl);
  if (!title || !sourceUrl) return null;
  const offerId = stringValue(value.offerId) || extractOfferId(sourceUrl);
  const imageUrl = stringValue(value.imageUrl);
  const priceCny = numberValue(value.priceCny);
  const monthlySales = numberValue(value.monthlySales);
  const repurchaseRate = stringValue(value.repurchaseRate);
  const supplierName = stringValue(value.supplierName);
  const tradeScore = numberValue(value.tradeScore);
  const normalizedScore = numberValue(value.score) ?? calculateScore({
    title,
    sourceUrl,
    imageUrl,
    priceCny,
    monthlySales,
    keywordTokens,
  });

  return {
    offerId,
    title,
    priceCny,
    sourceUrl: offerId ? canonicalOfferUrl(offerId, sourceUrl) ?? sourceUrl : sourceUrl,
    imageUrl,
    monthlySales,
    tradeScore,
    repurchaseRate,
    supplierName,
    score: Math.min(100, Math.max(0, Math.round(normalizedScore))),
  };
}

function calculateScore(input: {
  title: string;
  sourceUrl: string;
  imageUrl: string | null;
  priceCny: number | null;
  monthlySales: number | null;
  keywordTokens: string[];
}): number {
  let score = 40;
  const normalizedTitle = input.title.toLowerCase();

  if (input.keywordTokens.length > 0) {
    const matched = input.keywordTokens.filter((token) => normalizedTitle.includes(token)).length;
    score += Math.round((matched / input.keywordTokens.length) * 24);
  }

  if (input.priceCny != null && input.priceCny > 0 && input.priceCny <= 300) score += 10;
  if (input.sourceUrl.includes('1688.com')) score += 8;
  if (input.imageUrl) score += 6;
  if (input.monthlySales != null && input.monthlySales > 0) {
    score += Math.min(10, Math.round(Math.log10(input.monthlySales + 1) * 4));
  }

  return Math.min(100, score);
}

function canonicalOfferUrl(offerId: string | null, fallback?: string | null): string | null {
  if (offerId) return `https://detail.1688.com/offer/${offerId}.html`;
  return fallback || null;
}

function extractOfferId(value: string): string | null {
  return /offer(?:detail)?\/(\d+)\.html/.exec(value)?.[1] ??
    /offerId=(\d+)/.exec(value)?.[1] ??
    null;
}

function readQuantityPrice(record: Record<string, unknown>): number | null {
  const prices = readArray(record, ['shopAddition', 'quantityPrices']);
  const values = prices
    .map((price) => isRecord(price) ? numberValue(price.value) : null)
    .filter((price): price is number => price != null);
  return values.length > 0 ? Math.min(...values) : null;
}

function readRepurchaseRateFromTags(record: Record<string, unknown>): string | null {
  const tags = readArray(record, ['tags']);
  for (const tag of tags) {
    if (!isRecord(tag)) continue;
    const text = stringValue(tag.text);
    const match = text?.match(/(\d+(?:\.\d+)?%)/);
    if (match) return match[1];
  }
  return null;
}

function normalizeKeyword(keyword: string): string[] {
  return keyword
    .toLowerCase()
    .split(/[^a-z0-9가-힣\u4e00-\u9fff]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function readBaseUrl(): string {
  return (process.env.DIRECT_1688_MTOP_BASE_URL || DEFAULT_1688_MTOP_BASE_URL).replace(/\/+$/, '');
}

function buildSearchPageUrl(keyword: string, page: number): string {
  const url = new URL(SEARCH_PAGE_BASE_URL);
  url.searchParams.set('keywords', keyword);
  if (page > 1) url.searchParams.set('beginPage', String(page));
  return url.toString();
}

function resolveSourcingSearchUserDataDir(): string {
  return resolve(process.env.SOURCING_PLAYWRIGHT_USER_DATA_DIR?.trim() || DEFAULT_USER_DATA_DIR);
}

function resolveSourcingSearchHeadless(): boolean {
  const env = process.env.SOURCING_PLAYWRIGHT_HEADLESS;
  return env !== '0' && env !== 'false';
}

function resolveBrowserExecutablePath(): string | undefined {
  const candidates = [
    process.env.SOURCING_PLAYWRIGHT_EXECUTABLE_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ].filter((candidate): candidate is string => Boolean(candidate?.trim()));
  return candidates.find((candidate) => existsSync(candidate));
}

function is1688UserValidateError(error: unknown): boolean {
  return error instanceof BadGatewayException && error.message.includes('FAIL_SYS_USER_VALIDATE');
}

function firstArray(value: unknown, paths: string[][]): unknown[] {
  for (const path of paths) {
    const found = readArray(value, path);
    if (found.length > 0) return found;
  }
  return [];
}

function readArray(value: unknown, path: string[]): unknown[] {
  const found = readPath(value, path);
  return Array.isArray(found) ? found : [];
}

function readFirstString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = stringValue(record[key]);
    if (value) return value;
  }
  return null;
}

function readString(record: Record<string, unknown>, path: string[]): string | null {
  return stringValue(readPath(record, path));
}

function readFirstNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = numberValue(record[key]);
    if (value != null) return value;
  }
  return null;
}

function readNumber(record: Record<string, unknown>, path: string[]): number | null {
  return numberValue(readPath(record, path));
}

function readPath(value: unknown, path: string[]): unknown {
  let current = value;
  for (const segment of path) {
    if (!isRecord(current)) return null;
    current = current[segment];
  }
  return current;
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
