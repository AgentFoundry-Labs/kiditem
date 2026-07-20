import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { AgentOsRuntimeError } from '../../../../agent-os/domain/agent-os.errors';
import type {
  AgentRuntimeExecutionContext,
  AgentRuntimeResult,
} from '../../../../agent-os/application/port/out/runtime/agent-runtime.port';
import type { AgentTypeRuntimeHandler } from '../../../../agent-os/application/port/out/runtime/agent-runtime-handler.port';
import { detectSourcingScrapePlatform } from '../../../domain/sourcing-url';
import { extract1688DetailModelSnapshot } from './extractor/supplier-1688-detail-model.extractor';

const DEFAULT_USER_DATA_DIR = '.kiditem/playwright/sourcing';
const NAVIGATE_TIMEOUT_MS = 30_000;
const DATA_WAIT_TIMEOUT_MS = 15_000;
const SCROLL_PAUSE_MS = 500;
const MAGIC_SCRAPER_SKILL_KEY = 'sourcing.magic_scraper';
const SOURCING_PROFILE_FALLBACK_PREFIX = 'kiditem-sourcing-profile-';
const sourcingProfileQueues = new Map<string, Promise<void>>();

const DATA_READY_CHECK = `
(() => {
  if (window.context && window.context.result) return 'context';
  if (window.__INIT_DATA__ && window.__INIT_DATA__.globalData) return '__INIT_DATA__';
  if (window.detailData && window.detailData.globalData) return 'detailData';
  return false;
})()
`;

const READ_1688_DETAIL_MODEL_SNAPSHOT = `
(() => {
  const result = window.context && window.context.result;
  const model = result
    && result.global
    && result.global.globalData
    && result.global.globalData.model;
  if (!model || !model.offerDetail) return null;
  return {
    model,
    data: result.data || null,
  };
})()
`;

const WAIT_FOR_1688_DETAIL_MODEL = `
(() => {
  const result = window.context && window.context.result;
  const model = result
    && result.global
    && result.global.globalData
    && result.global.globalData.model;
  return Boolean(model && model.offerDetail && (model.offerDetail.subject || model.offerDetail.offerId));
})()
`;

const EXTRACT_WITH_PRODUCT_SCRAPER = `
(bridgeData) => {
  const scraper = window.ProductScraper;
  if (!scraper || !scraper.common) return null;
  const platform = scraper.common.detectPlatform();
  if (!platform) return null;
  const extractors = {
    ALIBABA: scraper.alibaba,
    "1688": scraper.alibaba1688,
  };
  const extractor = extractors[platform];
  if (!extractor || typeof extractor.extract !== "function") return null;
  return extractor.extract(bridgeData);
}
`;

const DETAIL_DESCRIPTION_FETCH = `
(detailUrl) => {
  return fetch(detailUrl)
    .then((resp) => resp.ok ? resp.text() : null)
    .then((html) => {
      if (!html) return null;
      let content = html;
      const marker = "var offer_details=";
      const idx = html.indexOf(marker);
      if (idx !== -1) {
        const start = idx + marker.length;
        let depth = 0, inStr = false, esc = false, end = -1;
        for (let i = start; i < html.length; i++) {
          const c = html.charAt(i);
          if (esc) { esc = false; continue; }
          if (c === "\\\\") { esc = true; continue; }
          if (c === '"') { inStr = !inStr; continue; }
          if (inStr) continue;
          if (c === "{") depth++;
          if (c === "}") { depth--; if (depth === 0) { end = i + 1; break; } }
        }
        if (end > start) {
          try {
            const parsed = JSON.parse(html.substring(start, end));
            if (parsed.content) content = parsed.content;
          } catch {}
        }
      }

      const images = [];
      const imgRe = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
      let match;
      while ((match = imgRe.exec(content)) !== null) {
        const src = match[1];
        if (src.startsWith("data:") || src.includes("icon") || src.includes("logo")) continue;
        const full = src.startsWith("//") ? "https:" + src : src;
        if (!images.includes(full)) images.push(full);
      }

      const texts = [];
      const seen = {};
      const textRe = /<(?:p|h[1-6]|li|td|th|div|span)[^>]*>([^<]{5,})<\\//gi;
      while ((match = textRe.exec(content)) !== null) {
        const text = match[1].replace(/&[^;]+;/g, " ").trim();
        if (text.length < 5 || text.length > 2000 || seen[text]) continue;
        seen[text] = true;
        texts.push(text);
      }

      if (images.length === 0 && texts.length === 0) return null;
      return {
        description_images: images,
        description_text: texts.join("\\n").slice(0, 10000),
        description_image_count: images.length,
      };
    })
    .catch(() => null);
}
`;

interface ExtractorScripts {
  commonJs: string;
  platformJs: string;
  bridgeJs: string;
}

interface ExtractionAttemptResult {
  data: Record<string, unknown> | null;
  recoveryReason?: string;
}

interface BrowserPageSession {
  page: Page;
  close: () => Promise<void>;
}

interface PersistentContextLaunch {
  context: BrowserContext;
  temporaryUserDataDir?: string;
}

@Injectable()
export class SourcingPlaywrightRuntimeHandler implements AgentTypeRuntimeHandler {
  private readonly logger = new Logger(SourcingPlaywrightRuntimeHandler.name);

  async execute(context: AgentRuntimeExecutionContext): Promise<AgentRuntimeResult> {
    const action = stringField(context.input.action);
    if (action !== 'scrape_url') {
      throw new AgentOsRuntimeError(
        'sourcing_unknown_action',
        `Unknown sourcing action: ${action ?? '(missing)'}`,
      );
    }

    const url = stringField(context.input.url);
    if (!url) {
      throw new AgentOsRuntimeError('sourcing_missing_url', 'url is required for sourcing scrape_url.');
    }

    const result = await this.scrapeProductUrl(url, context.runtimeConfig);
    this.logger.debug(`sourcing playwright runtime completed run=${context.runId}`);
    return {
      provider: 'ts-playwright',
      output: result,
    };
  }

  private async scrapeProductUrl(
    url: string,
    runtimeConfig: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const platform = detectSourcingPlatform(url);
    if (!platform) {
      return { ok: false, error: 'Unsupported sourcing URL', source_url: url, platform: null };
    }

    const cdpEndpoint = resolveSourcingPlaywrightCdpEndpoint(runtimeConfig);
    if (cdpEndpoint) return this.scrapeWithPageSession(url, platform, runtimeConfig);

    const userDataDir = resolveSourcingPlaywrightUserDataDir(runtimeConfig);
    return withSourcingProfileQueue(userDataDir, () =>
      this.scrapeWithPageSession(url, platform, runtimeConfig),
    );
  }

  private async scrapeWithPageSession(
    url: string,
    platform: '1688' | 'ALIBABA',
    runtimeConfig: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    let session: BrowserPageSession;
    try {
      session = await this.openPageSession(runtimeConfig);
    } catch (error) {
      const recoveryReason = browserLaunchRecoveryReason(error);
      this.logger.warn(`sourcing browser launch failed for ${url}: ${recoveryReason}`);
      return {
        ok: false,
        error: 'Failed to open sourcing browser',
        source_url: url,
        platform,
        requiresRecovery: true,
        recommendedSkillKey: MAGIC_SCRAPER_SKILL_KEY,
        recoveryReason,
      };
    }

    try {
      const extracted = await this.extract(session.page, url, platform);
      if (!extracted.data) {
        const output: Record<string, unknown> = {
          ok: false,
          error: 'Failed to extract data',
          source_url: url,
          platform,
          requiresRecovery: true,
          recommendedSkillKey: MAGIC_SCRAPER_SKILL_KEY,
        };
        if (extracted.recoveryReason) output.recoveryReason = extracted.recoveryReason;
        return output;
      }
      return {
        ok: true,
        scraped_data: normalizeScrapedData(url, platform, extracted.data),
        source_url: url,
        platform,
      };
    } finally {
      await session.close();
    }
  }

  private async openPageSession(
    runtimeConfig: Record<string, unknown>,
  ): Promise<BrowserPageSession> {
    const cdpEndpoint = resolveSourcingPlaywrightCdpEndpoint(runtimeConfig);
    if (cdpEndpoint) {
      const browser = await chromium.connectOverCDP(cdpEndpoint, { timeout: 20_000 });
      const context = browser.contexts()[0] ?? await browser.newContext();
      const page = await context.newPage();
      await page.setViewportSize({ width: 1920, height: 1080 }).catch(() => undefined);
      return {
        page,
        close: async () => {
          await page.close().catch(() => undefined);
          await browser.close().catch(() => undefined);
        },
      };
    }

    const userDataDir = resolveSourcingPlaywrightUserDataDir(runtimeConfig);
    await mkdir(userDataDir, { recursive: true });
    const launch = await this.launchPersistentSourcingContext(userDataDir, runtimeConfig);
    const { context } = launch;
    return {
      page: context.pages()[0] ?? await context.newPage(),
      close: async () => {
        try {
          await context.close();
        } finally {
          if (launch.temporaryUserDataDir) {
            await rm(launch.temporaryUserDataDir, { recursive: true, force: true }).catch(() => undefined);
          }
        }
      },
    };
  }

  private async launchPersistentSourcingContext(
    userDataDir: string,
    runtimeConfig: Record<string, unknown>,
  ): Promise<PersistentContextLaunch> {
    const options = {
      executablePath: chromium.executablePath(),
      headless: resolveHeadless(runtimeConfig),
      viewport: { width: 1920, height: 1080 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    };

    try {
      return {
        context: await chromium.launchPersistentContext(userDataDir, options),
      };
    } catch (error) {
      if (!isProcessSingletonProfileError(error)) throw error;

      const temporaryUserDataDir = await mkdtemp(join(tmpdir(), SOURCING_PROFILE_FALLBACK_PREFIX));
      this.logger.warn(
        `sourcing playwright profile is locked (${userDataDir}); retrying with temporary profile ${temporaryUserDataDir}`,
      );
      try {
        return {
          context: await chromium.launchPersistentContext(temporaryUserDataDir, options),
          temporaryUserDataDir,
        };
      } catch (fallbackError) {
        await rm(temporaryUserDataDir, { recursive: true, force: true }).catch(() => undefined);
        throw fallbackError;
      }
    }
  }

  private async extract(
    page: Page,
    url: string,
    platform: '1688' | 'ALIBABA',
  ): Promise<ExtractionAttemptResult> {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAVIGATE_TIMEOUT_MS });
      try {
        await page.waitForFunction(DATA_READY_CHECK, undefined, {
          timeout: DATA_WAIT_TIMEOUT_MS,
        });
      } catch {
        this.logger.warn(`sourcing data wait timed out for ${url}`);
      }

      await page.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
      await page.waitForTimeout(SCROLL_PAUSE_MS);
      await page.evaluate('window.scrollTo(0, 0)');
      await page.waitForTimeout(SCROLL_PAUSE_MS);
    } catch (error) {
      if (error instanceof AgentOsRuntimeError) throw error;
      const recoveryReason = runtimeErrorMessage(error);
      this.logger.warn(`sourcing page preparation failed for ${url}: ${recoveryReason}`);
      return { data: null, recoveryReason };
    }

    let extraction: ExtractionAttemptResult = { data: null };
    if (platform === '1688' && detectSourcingPlatform(url) === '1688') {
      extraction = await this.extractWith1688DetailModel(page, url);
    }
    if (!extraction.data) {
      extraction = await this.extractWithProductScraper(page, url, platform);
    }
    if (!extraction.data) {
      const recoveryReason = extraction.recoveryReason
        ?? await this.detectRecoveryReason(page);
      return { data: null, recoveryReason };
    }

    const detailUrl = stringField(extraction.data._detail_url);
    if (detailUrl && platform === '1688' && detectSourcingPlatform(detailUrl) === '1688') {
      try {
        const description = await page.evaluate(DETAIL_DESCRIPTION_FETCH, detailUrl);
        if (isRecord(description)) {
          return { data: { ...extraction.data, ...description } };
        }
      } catch (error) {
        const reason = runtimeErrorMessage(error);
        this.logger.warn(`sourcing detail description extraction failed for ${url}: ${reason}`);
      }
    }

    return { data: extraction.data };
  }

  private async extractWith1688DetailModel(
    page: Page,
    url: string,
  ): Promise<ExtractionAttemptResult> {
    try {
      await page.waitForFunction(WAIT_FOR_1688_DETAIL_MODEL, undefined, {
        timeout: DATA_WAIT_TIMEOUT_MS,
      }).catch(() => undefined);
      const snapshot = await page.evaluate(READ_1688_DETAIL_MODEL_SNAPSHOT);
      const extracted = extract1688DetailModelSnapshot(snapshot);
      return { data: extracted };
    } catch (error) {
      if (error instanceof AgentOsRuntimeError) throw error;
      const recoveryReason = runtimeErrorMessage(error);
      this.logger.warn(`1688 context model extraction failed for ${url}: ${recoveryReason}`);
      return { data: null, recoveryReason };
    }
  }

  private async extractWithProductScraper(
    page: Page,
    url: string,
    platform: '1688' | 'ALIBABA',
  ): Promise<ExtractionAttemptResult> {
    try {
      const scripts = await loadExtractorScripts(platform);
      await page.evaluate(scripts.commonJs);
      await page.evaluate(scripts.platformJs);
      const bridgeData = await page.evaluate(BRIDGE_DATA_FROM_PRODUCT_SCRAPER_BRIDGE, scripts.bridgeJs);
      const extracted = await page.evaluate(EXTRACT_WITH_PRODUCT_SCRAPER, bridgeData);
      return { data: isRecord(extracted) ? extracted : null };
    } catch (error) {
      if (error instanceof AgentOsRuntimeError) throw error;
      const recoveryReason = runtimeErrorMessage(error);
      this.logger.warn(`product-scraper extraction failed for ${url}: ${recoveryReason}`);
      return { data: null, recoveryReason };
    }
  }

  private async detectRecoveryReason(page: Page): Promise<string | undefined> {
    try {
      const currentUrl = typeof page.url === 'function' ? page.url() : '';
      if (currentUrl.includes('/_____tmd_____/punish') || currentUrl.includes('punish?')) {
        return '1688 captcha or anti-bot page detected';
      }

      const title = typeof page.title === 'function' ? await page.title() : '';
      if (matchesBlockedSupplierPage(title)) return '1688 captcha or anti-bot page detected';

      const bodyText = await page.evaluate('document.body ? document.body.innerText.slice(0, 2000) : ""');
      return matchesBlockedSupplierPage(stringField(bodyText) ?? '')
        ? '1688 captcha or anti-bot page detected'
        : undefined;
    } catch {
      return undefined;
    }
  }
}

export function detectSourcingPlatform(url: string): '1688' | 'ALIBABA' | null {
  return detectSourcingScrapePlatform(url);
}

export function normalizeScrapedData(
  sourceUrl: string,
  platform: '1688' | 'ALIBABA',
  data: Record<string, unknown>,
): Record<string, unknown> {
  const {
    _detail_url: _detailUrl,
    _extraction_method: _extractionMethod,
    ...rest
  } = data;
  void _detailUrl;
  void _extractionMethod;
  return {
    ...rest,
    source_url: sourceUrl,
    source_platform: rest.source_platform ?? platform,
    page_type: rest.page_type ?? 'detail',
  };
}

export function resolveSourcingPlaywrightUserDataDir(runtimeConfig: Record<string, unknown>): string {
  const configured = stringField(runtimeConfig.playwrightUserDataDir);
  const env = process.env.SOURCING_PLAYWRIGHT_USER_DATA_DIR?.trim() || null;
  return resolve(configured ?? env ?? DEFAULT_USER_DATA_DIR);
}

export function resolveSourcingPlaywrightCdpEndpoint(
  runtimeConfig: Record<string, unknown>,
): string | null {
  const configured =
    stringField(runtimeConfig.playwrightCdpEndpoint) ??
    stringField(runtimeConfig.cdpEndpoint);
  const env = process.env.SOURCING_PLAYWRIGHT_CDP_ENDPOINT?.trim() || null;
  return configured ?? env;
}

async function withSourcingProfileQueue<T>(
  userDataDir: string,
  task: () => Promise<T>,
): Promise<T> {
  const previous = sourcingProfileQueues.get(userDataDir) ?? Promise.resolve();
  let releaseCurrent!: () => void;
  const current = new Promise<void>((resolveCurrent) => {
    releaseCurrent = resolveCurrent;
  });
  const queued = previous.catch(() => undefined).then(() => current);
  sourcingProfileQueues.set(userDataDir, queued);

  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    releaseCurrent();
    if (sourcingProfileQueues.get(userDataDir) === queued) {
      sourcingProfileQueues.delete(userDataDir);
    }
  }
}

function resolveHeadless(runtimeConfig: Record<string, unknown>): boolean {
  if (typeof runtimeConfig.playwrightHeadless === 'boolean') {
    return runtimeConfig.playwrightHeadless;
  }
  const env = process.env.SOURCING_PLAYWRIGHT_HEADLESS;
  return env !== '0' && env !== 'false';
}

function runtimeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function browserLaunchRecoveryReason(error: unknown): string {
  const message = runtimeErrorMessage(error);
  if (isProcessSingletonProfileError(error)) {
    return [
      'Sourcing browser profile is already in use.',
      'Another scrape may still be running, or the previous Chrome process left a profile lock.',
      'Retry after the active scrape finishes, or configure SOURCING_PLAYWRIGHT_CDP_ENDPOINT for a dedicated logged-in Chrome profile.',
    ].join(' ');
  }
  return message;
}

function isProcessSingletonProfileError(error: unknown): boolean {
  const message = runtimeErrorMessage(error);
  return /ProcessSingleton|SingletonLock|profile directory.*already in use|Failed to create .*SingletonLock/i.test(message);
}

function matchesBlockedSupplierPage(value: string): boolean {
  return /captcha|interception|verify|slider|验证码|滑块|请拖动|安全验证/i.test(value);
}

async function loadExtractorScripts(platform: '1688' | 'ALIBABA'): Promise<ExtractorScripts> {
  const dir = resolveExtractorDir();
  const commonJs = await readFile(resolve(dir, 'common.js'), 'utf8');
  const platformJs = await readFile(resolve(dir, platform === '1688' ? '1688.js' : 'alibaba.js'), 'utf8');
  const bridgeJs = await readFile(resolve(dir, platform === '1688' ? '1688-bridge.js' : 'page-bridge.js'), 'utf8');
  return { commonJs, platformJs, bridgeJs };
}

function resolveExtractorDir(): string {
  const candidates = [
    resolve(process.cwd(), 'extensions/product-scraper/extractors'),
    resolve(process.cwd(), '../../extensions/product-scraper/extractors'),
    resolve(__dirname, '../../../../../../../extensions/product-scraper/extractors'),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new AgentOsRuntimeError(
      'sourcing_extractors_missing',
      `Cannot find product-scraper extractors. Checked: ${candidates.join(', ')}`,
    );
  }
  return found;
}

const BRIDGE_DATA_FROM_PRODUCT_SCRAPER_BRIDGE = `
(bridgeJs) => {
  return new Promise((resolve) => {
    const validTypes = new Set(["__ps_1688_detail_data", "__ps_detail_data"]);
    let settled = false;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timer);
    };
    const finish = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const onMessage = (event) => {
      const data = event.data || {};
      if (event.source !== window || !validTypes.has(data.type)) return;
      try {
        finish(JSON.parse(data.payload));
      } catch {
        finish(null);
      }
    };
    const timer = window.setTimeout(() => finish(null), 1000);
    window.addEventListener("message", onMessage);
    const script = document.createElement("script");
    script.textContent = bridgeJs;
    (document.documentElement || document.head || document.body).appendChild(script);
    script.remove();
  });
}
`;

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
