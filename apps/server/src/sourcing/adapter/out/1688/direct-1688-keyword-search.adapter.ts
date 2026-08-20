import { Injectable } from '@nestjs/common';
import { parseAllowedSupplierUrl } from '../../../domain/supplier-source-url-policy';
import type { Page, Request, Response } from 'playwright';
import {
  type Search1688KeywordItem,
  type Search1688KeywordSession,
  Sourcing1688KeywordAttentionError,
  Sourcing1688KeywordProviderError,
  type Sourcing1688KeywordSearchPort,
} from '../../../application/port/out/provider/1688-keyword-search.port';
import {
  collect1688KeywordDomRecords,
  extract1688KeywordItemsFromApiPayload,
  extract1688KeywordItemsFromDomRecords,
  merge1688KeywordSearchItems,
} from './1688-keyword-search.extractor';
import {
  abortableBrowserStep,
  openCdpAbortableBrowserSession,
} from './abortable-browser-session';

const CDP_CONNECT_TIMEOUT_MS = 20_000;
const SEARCH_TIMEOUT_MS = 30_000;
const SEARCH_RESULT_SETTLE_WAIT_MS = 500;
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
    let extractionTrusted = false;
    const extractResponse = (response: Response) => {
      responseTasks.push(
        abortableBrowserStep(response.json(), signal)
          .then((payload) => {
            const items = extract1688KeywordItemsFromApiPayload(payload);
            if (items.length > 0) observedApiItems.push(items);
          })
          .catch(() => undefined),
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
      // 1688 can finish document parsing before its search XHR and shadow-card
      // render. This finite settle window is intentionally not networkidle or
      // an unbounded poll; abort races close the owned page immediately.
      await abortableBrowserStep(
        this.page.waitForTimeout(SEARCH_RESULT_SETTLE_WAIT_MS),
        signal,
      );
      await Promise.allSettled(responseTasks);
      signal?.throwIfAborted();

      const attention = await attentionRequired(this.page, signal);
      if (attention) throw attention;

      const apiItems = observedApiItems.flat();
      if (apiItems.length > 0) return merge1688KeywordSearchItems(apiItems, []).slice(0, SEARCH_RESULT_LIMIT);

      const domRecords = await abortableBrowserStep(
        this.page.evaluate(collect1688KeywordDomRecords, SEARCH_RESULT_LIMIT),
        signal,
      );
      const domItems = extract1688KeywordItemsFromDomRecords(domRecords);
      return domItems.slice(0, SEARCH_RESULT_LIMIT);
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
    text = await abortableBrowserStep(body.innerText({ timeout: 2_000 }), signal);
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
