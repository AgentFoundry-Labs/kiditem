import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { chromium, type Page } from 'playwright';
import { AgentOsRuntimeError } from '../../../../agent-os/domain/agent-os.errors';
import type {
  AgentRuntimeExecutionContext,
  AgentRuntimeResult,
} from '../../../../agent-os/application/port/out/runtime/agent-runtime.port';
import type { AgentTypeRuntimeHandler } from '../../../../agent-os/application/port/out/runtime/agent-runtime-handler.port';
import { AgentRuntimeHandlerRegistry } from '../../../../agent-os/application/service/agent-runtime-handler-registry.service';
import { detectSourcingScrapePlatform } from '../../../domain/sourcing-url';

const DEFAULT_USER_DATA_DIR = '.kiditem/playwright/sourcing';
const NAVIGATE_TIMEOUT_MS = 30_000;
const DATA_WAIT_TIMEOUT_MS = 15_000;
const SCROLL_PAUSE_MS = 500;

const DATA_READY_CHECK = `
() => {
  if (window.context && window.context.result) return 'context';
  if (window.__INIT_DATA__ && window.__INIT_DATA__.globalData) return '__INIT_DATA__';
  if (window.detailData && window.detailData.globalData) return 'detailData';
  return false;
}
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

@Injectable()
export class SourcingPlaywrightRuntimeHandler implements AgentTypeRuntimeHandler, OnModuleInit {
  private readonly logger = new Logger(SourcingPlaywrightRuntimeHandler.name);

  constructor(private readonly registry: AgentRuntimeHandlerRegistry) {}

  onModuleInit(): void {
    this.registry.register('sourcing', this);
  }

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

    const userDataDir = resolveSourcingPlaywrightUserDataDir(runtimeConfig);
    await mkdir(userDataDir, { recursive: true });

    const context = await chromium.launchPersistentContext(userDataDir, {
      executablePath: chromium.executablePath(),
      headless: resolveHeadless(runtimeConfig),
      viewport: { width: 1920, height: 1080 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });

    try {
      const page = context.pages()[0] ?? await context.newPage();
      const extracted = await this.extract(page, url, platform);
      if (!extracted) {
        return { ok: false, error: 'Failed to extract data', source_url: url, platform };
      }
      return {
        ok: true,
        scraped_data: normalizeScrapedData(url, platform, extracted),
        source_url: url,
        platform,
      };
    } finally {
      await context.close();
    }
  }

  private async extract(
    page: Page,
    url: string,
    platform: '1688' | 'ALIBABA',
  ): Promise<Record<string, unknown> | null> {
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

    const scripts = await loadExtractorScripts(platform);
    await page.evaluate(scripts.commonJs);
    await page.evaluate(scripts.platformJs);
    const bridgeData = await page.evaluate(BRIDGE_DATA_FROM_EXTENSION_BRIDGE, scripts.bridgeJs);
    const extracted = await page.evaluate(EXTRACT_WITH_PRODUCT_SCRAPER, bridgeData);
    if (!isRecord(extracted)) return null;

    const detailUrl = stringField(extracted._detail_url);
    if (detailUrl && platform === '1688' && detectSourcingPlatform(detailUrl) === '1688') {
      const description = await page.evaluate(DETAIL_DESCRIPTION_FETCH, detailUrl);
      if (isRecord(description)) {
        return { ...extracted, ...description };
      }
    }

    return extracted;
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

function resolveHeadless(runtimeConfig: Record<string, unknown>): boolean {
  if (typeof runtimeConfig.playwrightHeadless === 'boolean') {
    return runtimeConfig.playwrightHeadless;
  }
  const env = process.env.SOURCING_PLAYWRIGHT_HEADLESS;
  return env !== '0' && env !== 'false';
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

const BRIDGE_DATA_FROM_EXTENSION_BRIDGE = `
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
