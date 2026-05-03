import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type {
  CoupangInventoryRow,
  CoupangInventoryScrapePort,
} from '../../../application/port/out/coupang-inventory-scrape.port';

const MAX_PAGES = 50;
const PLAYWRITER_LIST_TIMEOUT_MS = 5_000;
const PLAYWRITER_RUN_TIMEOUT_MS = 480_000;
const WING_INVENTORY_BASE =
  'https://wing.coupang.com/vendor-inventory/list?searchKeywordType=ALL&searchKeywords=&salesMethod=ALL&productStatus=ALL&stockSearchType=ALL&shippingFeeSearchType=ALL&displayCategoryCodes=&listingStartTime=null&listingEndTime=null&saleEndDateSearchType=ALL&bundledShippingSearchType=ALL&upBundling=ALL&displayDeletedProduct=false&shippingMethod=ALL&exposureStatus=ALL&locale=ko_KR&sortMethod=SORT_BY_REGISTRATION_DATE&countPerPage=50';

/**
 * Coupang Wing vendor-inventory 페이지를 Playwriter CLI 로 스크래핑하는 adapter.
 *
 * AGENTS.md 의 transitional shortcuts:
 *  - playwriter CLI subprocess 의존 — host 에 binary 설치 + 활성 세션 필수.
 *    prod / docker 환경 사용 시 ServiceUnavailableException throw.
 *  - 향후 headless playwright npm 의존으로 대체 가능.
 *
 * Bound to `COUPANG_INVENTORY_SCRAPE_PORT` in `ai.module.ts`.
 */
@Injectable()
export class CoupangInventoryScrapeAdapter implements CoupangInventoryScrapePort {
  private readonly logger = new Logger(CoupangInventoryScrapeAdapter.name);

  async scrapeAll(): Promise<CoupangInventoryRow[]> {
    if (process.env.NODE_ENV === 'production') {
      throw new ServiceUnavailableException(
        'Coupang inventory scrape 는 dev/local 환경 전용입니다. prod 에서는 Coupang Open API 또는 별도 백엔드 워커를 사용하세요.',
      );
    }

    const sessions = await this.listSessions();
    if (sessions.error) {
      throw new ServiceUnavailableException(`playwriter 실행 불가: ${sessions.error}`);
    }
    if (sessions.ids.length === 0) {
      throw new ServiceUnavailableException(
        '활성 Playwriter 세션이 없습니다. 터미널에서 `playwriter session new` 실행 후 쿠팡 Wing 에 로그인하세요.',
      );
    }

    return this.runScrape(sessions.ids[0]);
  }

  private listSessions(): Promise<{ ids: string[]; error?: string }> {
    return new Promise((resolve) => {
      const proc = spawn('playwriter', ['session', 'list'], { timeout: PLAYWRITER_LIST_TIMEOUT_MS });
      let stdout = '';
      let stderr = '';
      proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        if (code !== 0) {
          resolve({ ids: [], error: stderr.trim() || 'playwriter not found' });
          return;
        }
        const ids = stdout
          .split('\n')
          .map((line) => line.trim())
          .filter(
            (line) =>
              line &&
              !/^no active sessions/i.test(line) &&
              !/^ID\b/i.test(line) &&
              !/^-+$/.test(line),
          )
          .map((line) => line.split(/\s+/)[0])
          .filter((id) => /^[A-Za-z0-9_-]+$/.test(id));
        resolve({ ids });
      });
      proc.on('error', (error: Error) => {
        resolve({ ids: [], error: error.message });
      });
    });
  }

  private async runScrape(sessionId: string): Promise<CoupangInventoryRow[]> {
    const outputPath = path.join(os.tmpdir(), `coupang-inventory-${randomUUID()}.json`);
    const code = this.buildScrapeScript(outputPath);

    try {
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(
          'playwriter',
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

  private buildScrapeScript(outputPath: string): string {
    return `
(async () => {
  const fs = require('fs');
  const BASE = ${JSON.stringify(WING_INVENTORY_BASE)};
  const MAX_PAGES = ${MAX_PAGES};
  const OUTPUT = ${JSON.stringify(outputPath)};
  const ALL = [];

  let page = context.pages().find(p => p.url().includes('vendor-inventory/list'))
    ?? context.pages().find(p => p.url() === 'about:blank')
    ?? (await context.newPage());

  for (let p = 1; p <= MAX_PAGES; p++) {
    await page.goto(BASE + '&page=' + p, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('tr.inventory-line[data-inventory]', { timeout: 12000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 300));

    const rows = await page.evaluate(() => {
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

        out.push({ inventoryId, name, url });
      });
      return out;
    });

    if (rows.length === 0) break;
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
    typeof row.name === 'string' &&
    typeof row.url === 'string'
  );
}
