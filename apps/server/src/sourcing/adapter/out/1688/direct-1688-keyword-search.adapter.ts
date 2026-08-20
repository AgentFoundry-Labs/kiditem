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
  inspect1688KeywordDomReadiness,
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
const DOM_READINESS_STEP_TIMEOUT_MS = 1_000;
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

    // Install this before navigation to preserve the CDP response-observation
    // ordering contract. Sanitized live QA has only established category JSON,
    // not a stable offer-result endpoint plus request-key correlation and exact
    // schema. An ancillary body must therefore never authorize offers or zero.
    // DOM readiness below is the sole terminal extraction evidence.
    const observeResponse = (_response: Response) => undefined;

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
      const readinessDeadline = new ReadinessDeadline(SEARCH_RESULT_READINESS_TIMEOUT_MS);
      const initialAttention = await attentionRequired(this.page, signal, readinessDeadline);
      if (initialAttention) throw initialAttention;
      while (readinessDeadline.hasTime()) {
        signal?.throwIfAborted();

        const beforeDomAttention = await attentionRequired(this.page, signal, readinessDeadline);
        if (beforeDomAttention) throw beforeDomAttention;
        if (!readinessDeadline.hasTime()) break;
        const dom = await readTrustedDomReadiness(this.page, readinessDeadline, signal);
        const afterDomAttention = await attentionRequired(this.page, signal, readinessDeadline);
        if (afterDomAttention) throw afterDomAttention;
        if (!readinessDeadline.hasTime()) break;
        if (dom.kind === 'items') {
          const domItems = extract1688KeywordItemsFromDomRecords(dom.records);
          if (domItems.length > 0) return domItems.slice(0, SEARCH_RESULT_LIMIT);
          throw new Sourcing1688KeywordProviderError('search_extraction_failed');
        }
        if (dom.kind === 'explicit_zero') return [];
        // This is deliberately finite and never waits for network idle. It
        // gives current 1688 shadow rendering a realistic bounded window while
        // preserving the OperationRun's AbortSignal deadline. The same
        // monotonic deadline caps every frame probe and poll, so serial work
        // cannot extend the six-second readiness phase.
        const remainingReadinessMs = readinessDeadline.remaining();
        const pollMs = Math.min(SEARCH_RESULT_POLL_INTERVAL_MS, remainingReadinessMs);
        if (pollMs <= 0) break;
        await boundedBrowserStep(
          this.page.waitForTimeout(pollMs),
          remainingReadinessMs,
          signal,
        );
      }
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

async function readTrustedDomReadiness(
  page: Page,
  deadline: ReadinessDeadline,
  signal?: AbortSignal,
): Promise<Search1688KeywordDomReadiness> {
  if (!deadline.hasTime()) return { kind: 'unready' };
  const states: Search1688KeywordDomReadiness[] = [
    await inspectDomReadiness(page, deadline, signal),
  ];
  if (!deadline.hasTime()) return { kind: 'unready' };
  for (const frame of trustedReadinessFrames(page, deadline, signal)) {
    if (!deadline.hasTime()) return { kind: 'unready' };
    states.push(await inspectDomReadiness(frame, deadline, signal));
    if (!deadline.hasTime()) return { kind: 'unready' };
  }
  const records = states.flatMap((state) => state.kind === 'items' ? state.records : []);
  if (records.length > 0) return { kind: 'items', records };
  if (states.some((state) => state.kind === 'loading')) return { kind: 'loading' };
  if (states.some((state) => state.kind === 'explicit_zero')) return { kind: 'explicit_zero' };
  return { kind: 'unready' };
}

async function inspectDomReadiness(
  target: Pick<Page, 'evaluate'> | Pick<Frame, 'evaluate'>,
  deadline: ReadinessDeadline,
  signal?: AbortSignal,
): Promise<Search1688KeywordDomReadiness> {
  if (!deadline.hasTime()) return { kind: 'unready' };
  try {
    const value = await boundedBrowserStep(
      target.evaluate(inspect1688KeywordDomReadiness, SEARCH_RESULT_LIMIT),
      deadline.capped(DOM_READINESS_STEP_TIMEOUT_MS),
      signal,
    );
    if (!deadline.hasTime()) return { kind: 'unready' };
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

function trustedReadinessFrames(
  page: Pick<Page, 'url' | 'frames' | 'mainFrame'>,
  deadline: ReadinessDeadline,
  signal?: AbortSignal,
): Frame[] {
  if (!deadline.hasTime()) return [];
  let mainOrigin = '';
  try {
    mainOrigin = new URL(page.url()).origin;
  } catch {
    return [];
  }
  const frames: Frame[] = [];
  for (const frame of page.frames()) {
    signal?.throwIfAborted();
    if (!deadline.hasTime() || frames.length >= MAX_SAME_ORIGIN_READINESS_FRAMES) break;
    if (frame === page.mainFrame() || !isSameOriginTrustedFrame(frame, mainOrigin)) continue;
    frames.push(frame);
  }
  return frames;
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
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return Promise.reject(new Error('browser_step_timeout'));
  }
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

class ReadinessDeadline {
  private readonly deadline: number;

  constructor(timeoutMs: number) {
    this.deadline = performance.now() + timeoutMs;
  }

  remaining(): number {
    return Math.max(0, this.deadline - performance.now());
  }

  capped(maximumMs: number): number {
    return Math.min(maximumMs, this.remaining());
  }

  hasTime(): boolean {
    return this.remaining() > 0;
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

async function attentionRequired(
  page: Page,
  signal?: AbortSignal,
  deadline?: ReadinessDeadline,
): Promise<Sourcing1688KeywordAttentionError | null> {
  if (isKnownSecurityChallengeUrl(page.url())) {
    return new Sourcing1688KeywordAttentionError('security_challenge');
  }
  if (deadline && !deadline.hasTime()) return null;
  if (deadline) {
    for (const frame of trustedReadinessFrames(page, deadline, signal)) {
      if (isKnownSecurityChallengeUrl(frame.url())) {
        return new Sourcing1688KeywordAttentionError('security_challenge');
      }
    }
  }
  if (deadline && !deadline.hasTime()) return null;
  let text = '';
  try {
    const body = page.locator('body');
    const timeoutMs = deadline
      ? deadline.capped(ATTENTION_TEXT_TIMEOUT_MS)
      : ATTENTION_TEXT_TIMEOUT_MS;
    text = await boundedBrowserStep(body.innerText({ timeout: timeoutMs }), timeoutMs, signal);
    if (deadline && !deadline.hasTime()) return null;
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
    if (/(?:^|\/)_____tmd_____\/punish(?:[/.]|$)/iu.test(pathname)) return true;
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
