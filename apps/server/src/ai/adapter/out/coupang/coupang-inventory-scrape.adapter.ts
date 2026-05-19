import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type {
  CoupangInventoryRow,
  CoupangInventoryScrapeCapability,
  CoupangInventoryScrapePort,
} from '../../../application/port/out/provider/coupang-inventory-scrape.port';
import {
  isPlaywriterConnectionError,
  parseCreatedPlaywriterSessionId,
  parsePlaywriterSessionIds,
  spawnPlaywriter,
} from '../wing/playwriter-cli';

const MAX_PAGES = 50;
const PLAYWRITER_LIST_TIMEOUT_MS = 5_000;
const PLAYWRITER_BROWSER_START_TIMEOUT_MS = 20_000;
const PLAYWRITER_SESSION_NEW_TIMEOUT_MS = 20_000;
const PLAYWRITER_RUN_TIMEOUT_MS = 480_000;
const DEFAULT_CDP_PORT = 9222;
const WING_INVENTORY_BASE =
  'https://wing.coupang.com/vendor-inventory/list?searchKeywordType=ALL&searchKeywords=&salesMethod=ALL&productStatus=ALL&stockSearchType=ALL&shippingFeeSearchType=ALL&displayCategoryCodes=&listingStartTime=null&listingEndTime=null&saleEndDateSearchType=ALL&bundledShippingSearchType=ALL&upBundling=ALL&displayDeletedProduct=false&shippingMethod=ALL&exposureStatus=ALL&locale=ko_KR&sortMethod=SORT_BY_REGISTRATION_DATE&countPerPage=50';
const DEFAULT_MANAGED_PROFILE_DIR = path.join(os.homedir(), '.kiditem', 'wing-cdp-profile');
const SERVER_SCRAPER_ENABLED_ENV = 'COUPANG_IMAGE_SYNC_SERVER_SCRAPER_ENABLED';
const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

/**
 * Coupang Wing vendor-inventory 페이지를 Playwriter CLI 로 스크래핑하는 adapter.
 *
 * AGENTS.md 의 transitional shortcuts:
 *  - playwriter CLI subprocess 의존 — 활성 세션이 없으면 managed Chrome/CDP
 *    세션을 자동 생성한다. Wing 로그인/OTP 는 사람이 열린 브라우저에서 처리한다.
 *    prod / docker 환경 사용 시 ServiceUnavailableException throw.
 *  - 향후 headless playwright npm 의존으로 대체 가능.
 *
 * Bound to `COUPANG_INVENTORY_SCRAPE_PORT` in `ai.module.ts`.
 */
@Injectable()
export class CoupangInventoryScrapeAdapter implements CoupangInventoryScrapePort {
  private readonly logger = new Logger(CoupangInventoryScrapeAdapter.name);

  getCapabilities(): CoupangInventoryScrapeCapability {
    const enabled = isServerScraperEnabled();
    return {
      source: 'server_scraper',
      enabled,
      reason: enabled
        ? null
        : `${SERVER_SCRAPER_ENABLED_ENV}=true is required outside local/dev environments`,
    } satisfies CoupangInventoryScrapeCapability;
  }

  async scrapeAll(): Promise<CoupangInventoryRow[]> {
    const capability = this.getCapabilities();
    if (!capability.enabled) {
      throw new ServiceUnavailableException(
        'Coupang inventory scrape 는 현재 서버 환경에서 비활성화되어 있습니다. Chrome extension row 수집을 사용하거나 staging 전용 env flag 를 켜세요.',
      );
    }

    const sessions = await this.getOrCreateSession();
    if (sessions.error) {
      throw new ServiceUnavailableException(`playwriter 실행 불가: ${sessions.error}`);
    }
    if (sessions.ids.length === 0) {
      throw new ServiceUnavailableException(
        'Playwriter 세션을 자동 생성하지 못했습니다. 열린 Chrome 에서 쿠팡 Wing 로그인 상태를 확인하세요.',
      );
    }

    try {
      return await this.runScrape(selectNewestSessionId(sessions.ids));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (!isPlaywriterConnectionError(message)) throw error;

      this.logger.warn(`stale Playwriter session detected; creating managed direct session: ${message}`);
      const fresh = await this.createManagedDirectSession();
      if (fresh.error || fresh.ids.length === 0) {
        throw new ServiceUnavailableException(
          `Playwriter 세션을 재생성하지 못했습니다: ${fresh.error ?? 'session id not found'}`,
        );
      }
      return this.runScrape(selectNewestSessionId(fresh.ids));
    }
  }

  private async getOrCreateSession(): Promise<{ ids: string[]; error?: string }> {
    const sessions = await this.listSessions();
    if (sessions.error || sessions.ids.length > 0) return sessions;
    return this.createManagedDirectSession();
  }

  private listSessions(): Promise<{ ids: string[]; error?: string }> {
    return new Promise((resolve) => {
      const proc = spawnPlaywriter(['session', 'list'], { timeout: PLAYWRITER_LIST_TIMEOUT_MS });
      let stdout = '';
      let stderr = '';
      proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        if (code !== 0) {
          resolve({ ids: [], error: stderr.trim() || 'playwriter not found' });
          return;
        }
        resolve({ ids: parsePlaywriterSessionIds(stdout) });
      });
      proc.on('error', (error: Error) => {
        resolve({ ids: [], error: error.message });
      });
    });
  }

  private async createManagedDirectSession(): Promise<{ ids: string[]; error?: string }> {
    try {
      const cdpEndpoint = await this.ensureManagedChromeCdp();
      const created = await this.createDirectSession(cdpEndpoint);
      return created ? { ids: [created] } : { ids: [], error: 'playwriter session id not found' };
    } catch (error: unknown) {
      return { ids: [], error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async ensureManagedChromeCdp(): Promise<string> {
    const port = getCdpPort();
    const existing = await getCdpEndpoint(port);
    if (existing) return existing;

    const browserPath = resolveChromePath();
    const profileDir = process.env.PLAYWRITER_BROWSER_PROFILE_DIR?.trim() || DEFAULT_MANAGED_PROFILE_DIR;
    await fs.mkdir(profileDir, { recursive: true });

    const proc = spawn(
      browserPath,
      [
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${profileDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        'about:blank',
      ],
      { detached: true, stdio: 'ignore' },
    );
    proc.unref();
    this.logger.log(`started managed Chrome for Wing sync pid=${proc.pid ?? 'unknown'} port=${port}`);

    const started = Date.now();
    while (Date.now() - started < PLAYWRITER_BROWSER_START_TIMEOUT_MS) {
      const endpoint = await getCdpEndpoint(port);
      if (endpoint) return endpoint;
      await delay(250);
    }

    throw new Error('managed Chrome CDP endpoint did not become ready');
  }

  private createDirectSession(cdpEndpoint: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const proc = spawnPlaywriter(
        ['session', 'new', '--direct', cdpEndpoint],
        { timeout: PLAYWRITER_SESSION_NEW_TIMEOUT_MS },
      );
      let stdout = '';
      let stderr = '';
      proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(stderr.trim() || stdout.trim() || 'playwriter session new failed'));
          return;
        }
        resolve(parseCreatedPlaywriterSessionId(stdout));
      });
      proc.on('error', (error: Error) => reject(error));
    });
  }

  private async runScrape(sessionId: string): Promise<CoupangInventoryRow[]> {
    const outputPath = path.join(os.tmpdir(), `coupang-inventory-${randomUUID()}.json`);
    const code = this.buildScrapeScript(outputPath);

    try {
      await new Promise<void>((resolve, reject) => {
        const proc = spawnPlaywriter(
          ['-s', sessionId, '--timeout', '420000', '-e', code],
          { timeout: PLAYWRITER_RUN_TIMEOUT_MS },
        );
        let stdout = '';
        let stderr = '';
        proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
        proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
        proc.on('close', () => {
          this.logger.log(
            `playwriter stdout length=${stdout.length}, hasSUCCESS=${stdout.includes('SUCCESS')}`,
          );
          const errorLine = stdout.match(/ERROR:(.+)/)?.[1]?.trim();
          if (errorLine) {
            if (/쿠팡 Wing 로그인 필요/.test(errorLine)) {
              void this.openManagedWingPage().catch((error: unknown) => {
                this.logger.warn(
                  `failed to open Coupang Wing page in managed Chrome: ${
                    error instanceof Error ? error.message : String(error)
                  }`,
                );
              });
            }
            reject(new Error(errorLine));
            return;
          }
          if (!stdout.includes('SUCCESS')) {
            reject(new Error(stderr.trim() || 'Wing 스크레이프 실패'));
            return;
          }
          resolve();
        });
        proc.on('error', (error: Error) => reject(error));
      });

      const raw = await fs.readFile(outputPath, 'utf-8');
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.filter(isInventoryRow) : [];
    } finally {
      await fs.unlink(outputPath).catch(() => undefined);
    }
  }

  private async openManagedWingPage(): Promise<void> {
    await this.ensureManagedChromeCdp();
    await openCdpPage(getCdpPort(), WING_INVENTORY_BASE);
    this.logger.log('opened Coupang Wing page in managed Chrome for login');
  }

  private buildScrapeScript(outputPath: string): string {
    return `
(async () => {
  const fs = require('fs');
  const BASE = ${JSON.stringify(WING_INVENTORY_BASE)};
  const MAX_PAGES = ${MAX_PAGES};
  const OUTPUT = ${JSON.stringify(outputPath)};
  const ALL = [];
  const SEEN_PAGE_KEYS = new Set();

  function buildPageKey(rows) {
    return rows.map(row => String(row.inventoryId || '') + ':' + String(row.url || '')).join('|');
  }

  let page = context.pages().find(p => p.url().includes('vendor-inventory/list'))
    ?? context.pages().find(p => p.url() === 'about:blank')
    ?? (await context.newPage());

  for (let p = 1; p <= MAX_PAGES; p++) {
    await page.goto(BASE + '&page=' + p, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('tr.inventory-line[data-inventory]', { timeout: 12000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 300));

    const pageUrl = page.url();
    const bodyText = await page.locator('body').innerText({ timeout: 3000 }).catch(() => '');
    if (/login|signin|로그인|아이디|비밀번호/i.test(pageUrl + '\\n' + bodyText)) {
      console.log('ERROR:쿠팡 Wing 로그인 필요 — 열린 Chrome 에서 로그인 후 다시 이미지 동기화를 실행하세요.');
      return;
    }

    const rows = await page.evaluate(() => {
      function pickLegacyCode(text) {
        const normalized = String(text || '').replace(/\\s+/g, ' ');
        const match = normalized.match(/(?:판매자\\s*상품코드|업체\\s*상품코드|외부\\s*상품코드|상품코드)\\s*[:：]?\\s*([A-Za-z0-9_-]{2,})/);
        return match ? match[1] : '';
      }

      const out = [];
      const trs = document.querySelectorAll('tr.inventory-line[data-inventory]');
      trs.forEach(tr => {
        const inventoryId = tr.getAttribute('data-inventory') || '';
        if (!inventoryId) return;

        const img = tr.querySelector('img[alt="product"]') || tr.querySelector('.ip-left img') || tr.querySelector('img');
        let url = img ? (img.getAttribute('src') || img.getAttribute('data-src') || '') : '';
        if (url.startsWith('//')) url = 'https:' + url;
        if (!/^https?:/.test(url)) return;

        const titleEl = tr.querySelector('a.ip-title') || tr.querySelector('.ip-title');
        const name = (titleEl && titleEl.textContent ? titleEl.textContent : '').trim();
        const legacyCode = pickLegacyCode(tr.textContent || '');

        out.push({ inventoryId, legacyCode, name, url });
      });
      return out;
    });

    if (rows.length === 0) break;
    const pageKey = buildPageKey(rows);
    if (SEEN_PAGE_KEYS.has(pageKey)) {
      console.log('DUPLICATE PAGE ' + p + ' detected; stopping pagination');
      break;
    }
    SEEN_PAGE_KEYS.add(pageKey);
    ALL.push(...rows);
    console.log('PAGE ' + p + ': ' + rows.length + ' rows (total ' + ALL.length + ')');
    if (rows.length < 50) break;
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(ALL));
  console.log('WROTE ' + ALL.length + ' rows to ' + OUTPUT);
  console.log('SUCCESS');
})();
    `.trim();
  }
}

function isInventoryRow(value: unknown): value is CoupangInventoryRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.inventoryId === 'string' &&
    (typeof row.legacyCode === 'undefined' ||
      row.legacyCode === null ||
      typeof row.legacyCode === 'string') &&
    typeof row.name === 'string' &&
    typeof row.url === 'string'
  );
}

function selectNewestSessionId(ids: string[]): string {
  return ids[ids.length - 1];
}

async function getCdpEndpoint(port: number): Promise<string | null> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(1000),
    });
    if (!response.ok) return null;
    const json = (await response.json()) as { webSocketDebuggerUrl?: unknown };
    return typeof json.webSocketDebuggerUrl === 'string' ? json.webSocketDebuggerUrl : null;
  } catch {
    return null;
  }
}

function getCdpPort(): number {
  const port = Number(process.env.PLAYWRITER_DIRECT_PORT || DEFAULT_CDP_PORT);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`PLAYWRITER_DIRECT_PORT must be a positive integer: ${process.env.PLAYWRITER_DIRECT_PORT}`);
  }
  return port;
}

function isServerScraperEnabled(): boolean {
  const override = process.env[SERVER_SCRAPER_ENABLED_ENV]?.trim().toLowerCase();
  if (override) {
    return ['1', 'true', 'yes', 'on'].includes(override);
  }
  return process.env.NODE_ENV !== 'production';
}

async function openCdpPage(port: number, url: string): Promise<void> {
  const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, {
    method: 'PUT',
    signal: AbortSignal.timeout(1000),
  });
  if (!response.ok) {
    throw new Error(`Chrome CDP could not open page: HTTP ${response.status}`);
  }
}

function resolveChromePath(): string {
  const override = process.env.PLAYWRITER_BROWSER_PATH?.trim();
  if (override) {
    if (!existsSync(override)) throw new Error(`PLAYWRITER_BROWSER_PATH does not exist: ${override}`);
    return override;
  }

  const found = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      'Chrome executable not found. Set PLAYWRITER_BROWSER_PATH to a Chrome or Chromium binary.',
    );
  }
  return found;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
