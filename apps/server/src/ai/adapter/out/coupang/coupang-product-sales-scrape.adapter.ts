import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type {
  CoupangProductSalesRow,
  CoupangProductSalesScrapePort,
  CoupangProductSalesScrapeResult,
} from '../../../application/port/out/provider/coupang-product-sales-scrape.port';
import { spawnPlaywriter } from '../wing/playwriter-cli';

const PLAYWRITER_RUN_TIMEOUT_MS = 90_000;
const PLAYWRITER_INNER_TIMEOUT_MS = 60_000;

const WING_INVENTORY_BASE =
  'https://wing.coupang.com/vendor-inventory/list?searchKeywordType=ALL&salesMethod=ALL&productStatus=ALL&stockSearchType=ALL&shippingFeeSearchType=ALL&displayCategoryCodes=&listingStartTime=null&listingEndTime=null&saleEndDateSearchType=ALL&bundledShippingSearchType=ALL&upBundling=ALL&displayDeletedProduct=false&shippingMethod=ALL&exposureStatus=ALL&locale=ko_KR&sortMethod=SORT_BY_VI_LEVEL_UNIT_SOLD&countPerPage=50&page=1';

/**
 * Coupang Wing vendor-inventory 검색 결과에서 **단일 상품** 의 판매량/매출
 * 셀을 추출하는 playwriter adapter.
 *
 * 사용처: `ThumbnailTrackingService.collectDailySnapshot` — 적용된 썸네일의
 * 30일 매출 시계열 수집. 매일 한 번 호출되어 한 row 의 snapshot 을 적재한다.
 *
 * Wing DOM 의 정확한 셀 인덱스 (단위 판매량 / 매출 / 리뷰 컬럼 위치) 는
 * 실제 페이지 검사 후 selector 정제가 필요하다. 현재 구현은:
 *  - 검색 URL (`searchKeywords=<productName>`) 로 진입
 *  - `tr.inventory-line[data-inventory]` 행 찾고 productName 일치 검사
 *  - 모든 td cell text 를 raw 보존 + 알려진 패턴 (숫자 + "개", "₩", 별점) 정규식 추출
 *
 * Bound to `COUPANG_PRODUCT_SALES_SCRAPE_PORT` in `ai.module.ts`.
 */
@Injectable()
export class CoupangProductSalesScrapeAdapter implements CoupangProductSalesScrapePort {
  private readonly logger = new Logger(CoupangProductSalesScrapeAdapter.name);

  async scrapeByProductName(productName: string): Promise<CoupangProductSalesScrapeResult> {
    if (process.env.NODE_ENV === 'production') {
      throw new ServiceUnavailableException(
        'Coupang sales scrape 는 dev/local 환경 전용입니다. prod 에서는 Coupang Open API 를 사용하세요.',
      );
    }
    const trimmed = (productName || '').trim();
    if (!trimmed) {
      return { found: false, row: null, error: 'productName 비어있음' };
    }

    const outputPath = path.join(os.tmpdir(), `coupang-sales-${randomUUID()}.json`);
    const code = this.buildScrapeScript(trimmed, outputPath);

    try {
      const { stdout, stderr } = await this.runPlaywriter(code);
      const errorLine = stdout.match(/ERROR:(.+)/)?.[1]?.trim();
      if (errorLine) {
        return { found: false, row: null, error: errorLine };
      }
      if (!stdout.includes('SUCCESS')) {
        return { found: false, row: null, error: stderr.trim() || 'Wing 매출 스크레이프 실패' };
      }

      const raw = await fs.readFile(outputPath, 'utf-8');
      const parsed = JSON.parse(raw) as { found: boolean; row: ScrapedRowJson | null };
      if (!parsed.found || !parsed.row) {
        return { found: false, row: null };
      }
      return { found: true, row: this.normalizeRow(parsed.row) };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`sales scrape failed: ${message}`);
      return { found: false, row: null, error: message };
    } finally {
      await fs.unlink(outputPath).catch(() => undefined);
    }
  }

  private runPlaywriter(code: string): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const proc = spawnPlaywriter(
        ['-s', '1', '--timeout', String(PLAYWRITER_INNER_TIMEOUT_MS), '-e', code],
        { timeout: PLAYWRITER_RUN_TIMEOUT_MS },
      );
      let stdout = '';
      let stderr = '';
      proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', () => resolve({ stdout, stderr }));
      proc.on('error', (err: Error) => reject(err));
    });
  }

  private normalizeRow(row: ScrapedRowJson): CoupangProductSalesRow {
    const cells = Array.isArray(row.rawCellTexts) ? row.rawCellTexts.map((c) => String(c ?? '')) : [];
    return {
      inventoryId: String(row.inventoryId ?? ''),
      matchedName: String(row.matchedName ?? ''),
      unitsSold30d: extractFirstUnitsSoldFor30d(cells),
      unitsSold7d: extractFirstUnitsSoldFor7d(cells),
      revenueKrw: extractFirstKrw(cells),
      reviewCount: extractFirstReviewCount(cells),
      ratingAvg: extractFirstRating(cells),
      rawCellTexts: cells,
    };
  }

  private buildScrapeScript(productName: string, outputPath: string): string {
    const url = `${WING_INVENTORY_BASE}&searchKeywords=${encodeURIComponent(productName)}`;
    return `
(async () => {
  const fs = require('fs');
  const TARGET_NAME = ${JSON.stringify(productName)};
  const URL = ${JSON.stringify(url)};
  const OUT = ${JSON.stringify(outputPath)};

  function normalize(s) { return String(s || '').replace(/\\s+/g, ' ').trim(); }

  let page = context.pages().find(p => p.url().includes('vendor-inventory/list'))
    ?? context.pages().find(p => p.url() === 'about:blank')
    ?? (await context.newPage());

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('tr.inventory-line[data-inventory]', { timeout: 15000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 1000)); // 셀 렌더링 안정화

  const pageUrl = page.url();
  const bodyText = await page.locator('body').innerText({ timeout: 3000 }).catch(() => '');
  if (/login|signin|로그인|아이디|비밀번호/i.test(pageUrl + '\\n' + bodyText)) {
    console.log('ERROR:쿠팡 Wing 로그인 필요 — 열린 Chrome 에서 로그인 후 다시 실행하세요.');
    return;
  }

  const result = await page.evaluate((targetName) => {
    function norm(s) { return String(s || '').replace(/\\s+/g, ' ').trim(); }
    const targetNorm = norm(targetName);

    const trs = Array.from(document.querySelectorAll('tr.inventory-line[data-inventory]'));
    let matched = null;
    for (const tr of trs) {
      const titleEl = tr.querySelector('a.ip-title') || tr.querySelector('.ip-title');
      const text = norm(titleEl ? titleEl.textContent : '');
      if (!text) continue;
      if (text === targetNorm || text.includes(targetNorm) || targetNorm.includes(text)) {
        matched = tr;
        break;
      }
    }

    if (!matched) {
      return { found: false, totalCandidates: trs.length };
    }

    const cells = Array.from(matched.querySelectorAll('td')).map((td) => norm(td.textContent || ''));
    const titleEl = matched.querySelector('a.ip-title') || matched.querySelector('.ip-title');
    return {
      found: true,
      row: {
        inventoryId: matched.getAttribute('data-inventory') || '',
        matchedName: norm(titleEl ? titleEl.textContent : ''),
        rawCellTexts: cells,
      },
    };
  }, TARGET_NAME);

  fs.writeFileSync(OUT, JSON.stringify(result));
  console.log('TOTAL_CANDIDATES:' + (result.totalCandidates ?? '-'));
  console.log('FOUND:' + (result.found ? 'yes' : 'no'));
  console.log('SUCCESS');
})();
    `.trim();
  }
}

interface ScrapedRowJson {
  inventoryId?: unknown;
  matchedName?: unknown;
  rawCellTexts?: unknown;
}

// ── 셀 텍스트에서 numeric 값 추출 helpers ────────────────────────────────

/**
 * 30일 누적 판매량 — Wing 보통 "30일 판매 N개" 또는 "최근 30일 N" 패턴.
 * 못 찾으면 일반 "N개" 중 가장 큰 값.
 */
function extractFirstUnitsSoldFor30d(cells: string[]): number | null {
  for (const cell of cells) {
    const m = cell.match(/30\s*일[^\d]*(\d{1,3}(?:,\d{3})*|\d+)\s*개?/);
    if (m) return parseIntComma(m[1]);
  }
  return null;
}

function extractFirstUnitsSoldFor7d(cells: string[]): number | null {
  for (const cell of cells) {
    const m = cell.match(/7\s*일[^\d]*(\d{1,3}(?:,\d{3})*|\d+)\s*개?/);
    if (m) return parseIntComma(m[1]);
  }
  return null;
}

/** 매출 — "₩123,456" 또는 "123,456원" 패턴. 가장 큰 값 사용. */
function extractFirstKrw(cells: string[]): number | null {
  let max: number | null = null;
  for (const cell of cells) {
    const matches = cell.match(/(?:₩|￦)\s*(\d{1,3}(?:,\d{3})*|\d+)|(\d{1,3}(?:,\d{3})*|\d+)\s*원/g);
    if (!matches) continue;
    for (const m of matches) {
      const value = parseIntComma(m.replace(/[₩￦원\s,]/g, '').replace(/^,+|,+$/g, ''));
      if (value !== null && (max === null || value > max)) max = value;
    }
  }
  return max;
}

function extractFirstReviewCount(cells: string[]): number | null {
  for (const cell of cells) {
    const m = cell.match(/리뷰[^\d]*(\d{1,3}(?:,\d{3})*|\d+)/);
    if (m) return parseIntComma(m[1]);
  }
  return null;
}

function extractFirstRating(cells: string[]): number | null {
  for (const cell of cells) {
    const m = cell.match(/(\d\.\d)\s*\/\s*5|별점\s*(\d\.\d)/);
    if (m) {
      const v = m[1] ?? m[2];
      const n = Number.parseFloat(v);
      if (Number.isFinite(n) && n >= 0 && n <= 5) return n;
    }
  }
  return null;
}

function parseIntComma(input: string | undefined): number | null {
  if (!input) return null;
  const cleaned = input.replace(/,/g, '');
  const n = Number.parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : null;
}
