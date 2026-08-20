import { Injectable } from '@nestjs/common';
import { parseAllowedSupplierUrl } from '../../../domain/supplier-source-url-policy';
import type { Frame, Page, Request, Response } from 'playwright';
import {
  type Search1688KeywordItem,
  type Search1688KeywordSession,
  Sourcing1688KeywordAttentionError,
  Sourcing1688KeywordProviderError,
  type Sourcing1688KeywordSearchPort,
} from '../../../application/port/out/provider/1688-keyword-search.port';
import {
  extract1688KeywordItemsFromDomRecords,
  inspect1688KeywordApiPayload,
  inspect1688KeywordDomReadiness,
  merge1688KeywordSearchItems,
  type Search1688KeywordDomReadiness,
} from './1688-keyword-search.extractor';
import {
  abortableBrowserStep,
  openCdpAbortableBrowserSession,
} from './abortable-browser-session';

const CDP_CONNECT_TIMEOUT_MS = 20_000;
const SEARCH_TIMEOUT_MS = 30_000;
const SEARCH_RESULT_READINESS_TIMEOUT_MS = 6_000;
const SEARCH_RESULT_POLL_INTERVAL_MS = 200;
const SEARCH_RESULT_READINESS_ATTEMPTS =
  SEARCH_RESULT_READINESS_TIMEOUT_MS / SEARCH_RESULT_POLL_INTERVAL_MS;
const DOM_READINESS_STEP_TIMEOUT_MS = 1_000;
const RESPONSE_BODY_TIMEOUT_MS = 2_000;
const ATTENTION_TEXT_TIMEOUT_MS = 500;
const MAX_SAME_ORIGIN_READINESS_FRAMES = 3;
const SEARCH_RESULT_LIMIT = 40;
const SEARCH_URL = 'https://s.1688.com/selloffer/offer_search.htm';
const MAX_NAVIGATION_REDIRECT_HOPS = 12;

@Injectable()
export class Direct1688KeywordSearchAdapter implements Sourcing1688KeywordSearchPort {
  async openSession(input: { signal?: AbortSignal } = {}): Promise<Search1688KeywordSession> {
    input.signal?.throwIfAborted();
    const cdpEndpoint = readCdpEndpoint();
    try {
      const browserSession = await openCdpAbortableBrowserSession({
        cdpEndpoint,
        cdpConnectTimeoutMs: CDP_CONNECT_TIMEOUT_MS,
        signal: input.signal,
      });
      return new Direct1688KeywordSearchSession(browserSession.page, browserSession.close, input.signal);
    } catch (error) {
      input.signal?.throwIfAborted();
      if (error instanceof Sourcing1688KeywordProviderError) throw error;
      throw new Sourcing1688KeywordProviderError('cdp_unavailable');
    }
  }
}

class Direct1688KeywordSearchSession implements Search1688KeywordSession {
  private closed = false;
  private active = false;
  private readonly abortSession = () => {
    void this.close();
  };

  constructor(
    private readonly page: Page,
    private readonly closeBrowserSession: () => Promise<void>,
    private readonly sessionSignal?: AbortSignal,
  ) {
    this.sessionSignal?.addEventListener('abort', this.abortSession, { once: true });
  }

  async searchKeyword(input: { keyword: string; signal?: AbortSignal }): Promise<Search1688KeywordItem[]> {
    const signal = combinedSignal(this.sessionSignal, input.signal);
    signal?.throwIfAborted();
    if (this.closed) throw new Sourcing1688KeywordProviderError('search_extraction_failed');
    if (this.active) throw new Sourcing1688KeywordProviderError('search_extraction_failed');
    this.active = true;

    const observedApiItems: Search1688KeywordItem[][] = [];
    const responseTasks: Promise<void>[] = [];
    const deferredResponses: Response[] = [];
    let observedExplicitApiZero = false;
    let observedIndeterminateApi = false;
    let extractionTrusted = false;
    const extractResponse = (response: Response) => {
      responseTasks.push(
        boundedBrowserStep(response.json(), RESPONSE_BODY_TIMEOUT_MS, signal)
          .then((payload) => {
            const result = inspect1688KeywordApiPayload(payload);
            if (result.kind === 'items') observedApiItems.push(result.items);
            if (result.kind === 'explicit_zero') observedExplicitApiZero = true;
            if (result.kind === 'indeterminate') observedIndeterminateApi = true;
          })
          .catch(() => {
            observedIndeterminateApi = true;
          }),
      );
    };
    const observeResponse = (response: Response) => {
      if (!is1688SearchResponse(response)) return;
      // A response can arrive during document parsing. Do not deserialize any
      // body until the final navigation target has crossed the 1688 trust
      // boundary below.
      if (!extractionTrusted) {
        deferredResponses.push(response);
        return;
      }
      extractResponse(response);
    };

    this.page.on('response', observeResponse);
    try {
      const navigationResponse = await abortableBrowserStep(
        this.page.goto(searchUrlForKeyword(input.keyword), {
          waitUntil: 'domcontentloaded',
          timeout: SEARCH_TIMEOUT_MS,
        }),
        signal,
      );
      await abortableBrowserStep(
        this.page.waitForLoadState('domcontentloaded', { timeout: SEARCH_TIMEOUT_MS }),
        signal,
      ).catch((error: unknown) => {
        signal?.throwIfAborted();
        throw error;
      });
      assertTrusted1688Navigation(this.page.url());
      if (navigationResponse) assertTrusted1688NavigationResponse(navigationResponse);
      extractionTrusted = true;
      for (const response of deferredResponses) extractResponse(response);
      const initialAttention = await attentionRequired(this.page, signal);
      if (initialAttention) throw initialAttention;
      for (let attempt = 0; attempt < SEARCH_RESULT_READINESS_ATTEMPTS; attempt += 1) {
        await waitForObservedApiResponses(this.page, responseTasks, signal);
        signal?.throwIfAborted();

        const apiItems = observedApiItems.flat();
        if (apiItems.length > 0) {
          return merge1688KeywordSearchItems(apiItems, []).slice(0, SEARCH_RESULT_LIMIT);
        }
        if (observedIndeterminateApi) {
          throw new Sourcing1688KeywordProviderError('search_extraction_failed');
        }
        if (observedExplicitApiZero) return [];

        const dom = await readTrustedDomReadiness(this.page, signal);
        if (dom.kind === 'items') {
          const domItems = extract1688KeywordItemsFromDomRecords(dom.records);
          if (domItems.length > 0) return domItems.slice(0, SEARCH_RESULT_LIMIT);
          throw new Sourcing1688KeywordProviderError('search_extraction_failed');
        }
        if (dom.kind === 'explicit_zero') return [];
        if (attempt + 1 >= SEARCH_RESULT_READINESS_ATTEMPTS) break;
        // This is deliberately finite and never waits for network idle. It
        // gives current 1688 XHR/shadow rendering a realistic bounded window
        // while preserving the OperationRun's AbortSignal deadline.
        await abortableBrowserStep(
          this.page.waitForTimeout(SEARCH_RESULT_POLL_INTERVAL_MS),
          signal,
        );
      }
      const finalAttention = await attentionRequired(this.page, signal);
      if (finalAttention) throw finalAttention;
      throw new Sourcing1688KeywordProviderError('search_extraction_failed');
    } catch (error) {
      await this.close();
      signal?.throwIfAborted();
      if (error instanceof Sourcing1688KeywordAttentionError) throw error;
      if (error instanceof Sourcing1688KeywordProviderError) throw error;
      throw new Sourcing1688KeywordProviderError('search_extraction_failed');
    } finally {
      this.page.off('response', observeResponse);
      this.active = false;
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.sessionSignal?.removeEventListener('abort', this.abortSession);
    await this.closeBrowserSession();
  }
}

async function waitForObservedApiResponses(
  page: Page,
  tasks: readonly Promise<void>[],
  signal?: AbortSignal,
): Promise<void> {
  if (tasks.length === 0) return;
  const settled = Promise.allSettled([...tasks]).then(() => undefined);
  await abortableBrowserStep(
    Promise.race([
      settled,
      page.waitForTimeout(SEARCH_RESULT_POLL_INTERVAL_MS),
    ]),
    signal,
  );
}

async function readTrustedDomReadiness(
  page: Page,
  signal?: AbortSignal,
): Promise<Search1688KeywordDomReadiness> {
  const states: Search1688KeywordDomReadiness[] = [
    await inspectDomReadiness(page, signal),
  ];
  const mainOrigin = new URL(page.url()).origin;
  let inspectedFrames = 0;
  for (const frame of page.frames()) {
    if (frame === page.mainFrame() || !isSameOriginTrustedFrame(frame, mainOrigin)) continue;
    if (inspectedFrames >= MAX_SAME_ORIGIN_READINESS_FRAMES) break;
    states.push(await inspectDomReadiness(frame, signal));
    inspectedFrames += 1;
  }
  const records = states.flatMap((state) => state.kind === 'items' ? state.records : []);
  if (records.length > 0) return { kind: 'items', records };
  if (states.some((state) => state.kind === 'loading')) return { kind: 'loading' };
  if (states.some((state) => state.kind === 'explicit_zero')) return { kind: 'explicit_zero' };
  return { kind: 'unready' };
}

async function inspectDomReadiness(
  target: Pick<Page, 'evaluate'> | Pick<Frame, 'evaluate'>,
  signal?: AbortSignal,
): Promise<Search1688KeywordDomReadiness> {
  try {
    const value = await boundedBrowserStep(
      target.evaluate(inspect1688KeywordDomReadiness, SEARCH_RESULT_LIMIT),
      DOM_READINESS_STEP_TIMEOUT_MS,
      signal,
    );
    return isDomReadiness(value) ? value : { kind: 'unready' };
  } catch {
    signal?.throwIfAborted();
    return { kind: 'unready' };
  }
}

function isSameOriginTrustedFrame(frame: Frame, origin: string): boolean {
  try {
    const url = new URL(frame.url());
    return url.origin === origin && parseAllowedSupplierUrl(url.toString()).platform === '1688';
  } catch {
    return false;
  }
}

function isDomReadiness(value: unknown): value is Search1688KeywordDomReadiness {
  if (!value || typeof value !== 'object' || !('kind' in value)) return false;
  if (value.kind === 'items') return 'records' in value && Array.isArray(value.records);
  return value.kind === 'explicit_zero' || value.kind === 'loading' || value.kind === 'unready';
}

function boundedBrowserStep<T>(
  step: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutError = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error('browser_step_timeout')), timeoutMs);
  });
  return abortableBrowserStep(
    Promise.race([step, timeoutError]).finally(() => {
      if (timeout) clearTimeout(timeout);
    }),
    signal,
  );
}

function readCdpEndpoint(): string {
  const value = process.env.SOURCING_PLAYWRIGHT_CDP_ENDPOINT?.trim();
  if (!value) throw new Sourcing1688KeywordProviderError('cdp_configuration_invalid');
  try {
    const endpoint = new URL(value);
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(endpoint.protocol) ||
      !endpoint.hostname || endpoint.username || endpoint.password) {
      throw new Error('invalid_endpoint');
    }
    return value;
  } catch {
    throw new Sourcing1688KeywordProviderError('cdp_configuration_invalid');
  }
}

function searchUrlForKeyword(keyword: string): string {
  const url = new URL(SEARCH_URL);
  url.searchParams.set('keywords', keyword.trim());
  return url.toString();
}

function is1688SearchResponse(response: Response): boolean {
  try {
    const allowed = parseAllowedSupplierUrl(response.url());
    if (allowed.platform !== '1688') return false;
    const url = new URL(allowed.normalizedUrl);
    const contentType = response.headers()['content-type'] ?? '';
    return /json/iu.test(contentType) && /(?:search|offer|query)/iu.test(`${url.pathname}${url.search}`);
  } catch {
    return false;
  }
}

function assertTrusted1688Navigation(value: string): void {
  try {
    if (parseAllowedSupplierUrl(value).platform !== '1688') throw new TypeError('not_1688');
  } catch {
    throw new Sourcing1688KeywordProviderError('search_extraction_failed');
  }
}

function assertTrusted1688NavigationResponse(response: Response): void {
  assertTrusted1688Navigation(response.url());
  let request: Request | null = response.request();
  const visited = new Set<Request>();
  for (let hop = 0; request; hop += 1) {
    if (hop >= MAX_NAVIGATION_REDIRECT_HOPS || visited.has(request)) {
      throw new Sourcing1688KeywordProviderError('search_extraction_failed');
    }
    visited.add(request);
    assertTrusted1688Navigation(request.url());
    request = request.redirectedFrom();
  }
}

async function attentionRequired(page: Page, signal?: AbortSignal): Promise<Sourcing1688KeywordAttentionError | null> {
  if (isKnownSecurityChallengeUrl(page.url())) {
    return new Sourcing1688KeywordAttentionError('security_challenge');
  }
  let text = '';
  try {
    const body = page.locator('body');
    text = await boundedBrowserStep(body.innerText({ timeout: ATTENTION_TEXT_TIMEOUT_MS }), ATTENTION_TEXT_TIMEOUT_MS, signal);
  } catch {
    signal?.throwIfAborted();
    return null;
  }
  if (!text) return null;
  if (/(?:请(?:完成|进行)?安全验证|安全验证(?:失败|需要|已过期)|(?:拖动|滑动).{0,12}滑块|滑块.{0,12}(?:验证|认证)|(?:请输入|发送|短信).{0,12}验证码|验证码.{0,12}(?:错误|失效|验证)|security\s+(?:verification|check|challenge)(?:(?:\s+is)?\s+(?:required|needed|pending|failed)|(?=\s*(?:[.!?]|$)))|(?:please\s+)?(?:complete|perform)\s+(?:the\s+)?security\s+(?:verification|check|challenge)|슬라이더\s*를?\s*드래그하여\s*인증을\s*완료하세요|정상\s*접속을\s*위해\s*인증이\s*필요합니다)/iu.test(text)) {
    return new Sourcing1688KeywordAttentionError('security_challenge');
  }
  if (/(?:请先登录|登录后(?:再)?(?:继续|搜索)|(?:please\s+)?(?:log\s+in|login)\s+to\s+(?:continue|search)|sign\s+in\s+to\s+(?:continue|search))/iu.test(text)) {
    return new Sourcing1688KeywordAttentionError('login');
  }
  return null;
}

function isKnownSecurityChallengeUrl(value: string): boolean {
  try {
    const allowed = parseAllowedSupplierUrl(value);
    if (allowed.platform !== '1688') return false;
    const url = new URL(allowed.normalizedUrl);
    const pathname = url.pathname;
    if (/(?:^|\/)punish(?:[/.]|$)/iu.test(pathname)) return true;
    if (/(?:^|\/)captcha(?:[/.]|$)/iu.test(pathname)) return true;
    return /(?:^|\/)(?:captcha|verify)(?:[/.]|$)/iu.test(pathname)
      && /(?:^|\.)(?:captcha|verify)\.1688\.com$/iu.test(url.hostname);
  } catch {
    return false;
  }
}

function combinedSignal(...signals: Array<AbortSignal | undefined>): AbortSignal | undefined {
  const activeSignals = signals.filter((signal): signal is AbortSignal => signal != null);
  if (activeSignals.length === 0) return undefined;
  return activeSignals.length === 1 ? activeSignals[0] : AbortSignal.any(activeSignals);
}
