import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { StorageService } from '../../../common/storage/storage.service';
import { MastersService } from '../../../products/application/service/masters.service';
import { ThumbnailImageFetcherService } from '../../adapter/out/image-fetch/thumbnail-image-fetcher.adapter';

export type CoupangImageSyncJobStatus = 'running' | 'done' | 'failed';

export interface CoupangImageSyncJobState {
  jobId: string;
  organizationId: string;
  status: CoupangImageSyncJobStatus;
  phase: 'starting' | 'scraping' | 'downloading' | 'finished';
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  startedAt: number;
  finishedAt: number | null;
  error: string | null;
}

interface ScrapedWingRow {
  inventoryId: string;
  name: string;
  url: string;
}

interface MasterImageState {
  masterId: string;
  hasImage: boolean;
}

const JOB_TTL_MS = 10 * 60 * 1000;
const MAX_PAGES = 50;
const WING_INVENTORY_BASE =
  'https://wing.coupang.com/vendor-inventory/list?searchKeywordType=ALL&searchKeywords=&salesMethod=ALL&productStatus=ALL&stockSearchType=ALL&shippingFeeSearchType=ALL&displayCategoryCodes=&listingStartTime=null&listingEndTime=null&saleEndDateSearchType=ALL&bundledShippingSearchType=ALL&upBundling=ALL&displayDeletedProduct=false&shippingMethod=ALL&exposureStatus=ALL&locale=ko_KR&sortMethod=SORT_BY_REGISTRATION_DATE&countPerPage=50';

@Injectable()
export class CoupangImageSyncService {
  private readonly logger = new Logger(CoupangImageSyncService.name);
  private readonly jobs = new Map<string, CoupangImageSyncJobState>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly masters: MastersService,
    private readonly imageFetcher: ThumbnailImageFetcherService,
  ) {}

  start(organizationId: string): { jobId: string } {
    for (const job of this.jobs.values()) {
      if (job.organizationId === organizationId && job.status === 'running') {
        throw new ConflictException('이미 진행 중인 동기화 잡이 있습니다');
      }
    }

    const jobId = randomUUID();
    const job: CoupangImageSyncJobState = {
      jobId,
      organizationId,
      status: 'running',
      phase: 'starting',
      total: 0,
      processed: 0,
      succeeded: 0,
      failed: 0,
      startedAt: Date.now(),
      finishedAt: null,
      error: null,
    };
    this.jobs.set(jobId, job);

    void this.run(job).catch((error: unknown) => {
      job.status = 'failed';
      job.phase = 'finished';
      job.error = error instanceof Error ? error.message : String(error);
      job.finishedAt = Date.now();
      this.logger.error(`Coupang image sync job ${jobId} failed: ${job.error}`);
    });

    return { jobId };
  }

  getStatus(jobId: string, organizationId: string): CoupangImageSyncJobState {
    this.gc();
    const job = this.jobs.get(jobId);
    if (!job) throw new NotFoundException('jobId not found');
    if (job.organizationId !== organizationId) throw new ForbiddenException();
    return { ...job };
  }

  getCurrent(organizationId: string): CoupangImageSyncJobState | null {
    this.gc();
    const running = [...this.jobs.values()]
      .filter((job) => job.organizationId === organizationId)
      .filter((job) => job.status === 'running')
      .sort((a, b) => b.startedAt - a.startedAt);
    return running[0] ? { ...running[0] } : null;
  }

  private gc(): void {
    const now = Date.now();
    for (const [id, job] of this.jobs) {
      if (job.status !== 'running' && job.finishedAt && now - job.finishedAt > JOB_TTL_MS) {
        this.jobs.delete(id);
      }
    }
  }

  private async run(job: CoupangImageSyncJobState): Promise<void> {
    const { organizationId } = job;
    job.phase = 'scraping';

    const sessions = await this.listPlaywriterSessions();
    if (sessions.error) throw new Error(`playwriter 실행 불가: ${sessions.error}`);
    if (sessions.ids.length === 0) {
      throw new Error('활성 Playwriter 세션이 없습니다. 터미널에서 `playwriter session new` 실행 후 쿠팡 Wing 에 로그인하세요.');
    }

    const scrapedRows = await this.scrapeInventory(sessions.ids[0]);
    const uniqueRows = this.dedupeRows(scrapedRows);
    const targets = await this.filterRowsNeedingImage(organizationId, uniqueRows);

    job.total = targets.length;
    job.phase = 'downloading';

    if (job.total === 0) {
      job.status = 'done';
      job.phase = 'finished';
      job.finishedAt = Date.now();
      return;
    }

    for (const row of targets) {
      try {
        const synced = await this.syncOne(organizationId, row);
        if (synced) job.succeeded += 1;
      } catch (error: unknown) {
        job.failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Wing inventory ${row.inventoryId} image sync failed: ${message}`);
      } finally {
        job.processed += 1;
      }
    }

    job.status = 'done';
    job.phase = 'finished';
    job.finishedAt = Date.now();
  }

  private dedupeRows(rows: ScrapedWingRow[]): ScrapedWingRow[] {
    const seen = new Set<string>();
    const out: ScrapedWingRow[] = [];
    for (const row of rows) {
      if (!row.inventoryId || !row.url) continue;
      if (seen.has(row.inventoryId)) continue;
      seen.add(row.inventoryId);
      out.push(row);
    }
    return out;
  }

  private async filterRowsNeedingImage(
    organizationId: string,
    rows: ScrapedWingRow[],
  ): Promise<ScrapedWingRow[]> {
    const targets: ScrapedWingRow[] = [];
    for (const row of rows) {
      const listing = await this.prisma.channelListing.findFirst({
        where: {
          organizationId,
          channel: 'coupang',
          externalId: row.inventoryId,
          isDeleted: false,
        },
        select: {
          master: {
            select: {
              imageUrl: true,
              thumbnailUrl: true,
              images: {
                where: { organizationId, isDeleted: false },
                select: { id: true },
                take: 1,
              },
            },
          },
        },
      });
      if (!listing || !this.hasDisplayImage(listing.master)) targets.push(row);
    }
    return targets;
  }

  private hasDisplayImage(master: {
    imageUrl: string | null;
    thumbnailUrl: string | null;
    images: Array<{ id: string }>;
  }): boolean {
    return Boolean(master.imageUrl || master.thumbnailUrl || master.images.length > 0);
  }

  private async syncOne(organizationId: string, row: ScrapedWingRow): Promise<boolean> {
    const state = await this.ensureMasterAndListing(organizationId, row);
    if (state.hasImage) return false;

    const fetched = await this.imageFetcher.fetchImage(row.url);
    const ext = this.imageFetcher.extForMime(fetched.mimeType);
    const key = `product-images/${state.masterId}/coupang-${Date.now()}.${ext}`;
    const publicUrl = await this.storage.save(key, fetched.buffer, fetched.mimeType);

    await this.prisma.$transaction(async (tx) => {
      const current = await tx.masterProduct.findFirst({
        where: { id: state.masterId, organizationId, isDeleted: false },
        select: {
          imageUrl: true,
          thumbnailUrl: true,
          images: {
            where: { organizationId, isDeleted: false },
            select: { id: true },
            take: 1,
          },
        },
      });
      if (!current) throw new NotFoundException('master not found');
      if (this.hasDisplayImage(current)) return;

      await tx.masterProductImage.create({
        data: {
          organizationId,
          masterId: state.masterId,
          url: publicUrl,
          storageKey: key,
          role: 'product',
          label: 'Coupang Wing',
          sortOrder: 0,
          source: 'coupang-wing',
          mimeType: fetched.mimeType,
          fileSize: fetched.buffer.length,
          isPrimary: true,
        },
      });
      await tx.masterProduct.updateMany({
        where: { id: state.masterId, organizationId, isDeleted: false },
        data: {
          imageUrl: publicUrl,
          sourcePlatform: 'coupang',
          sourceUrl: row.url,
        },
      });
    }, { timeout: 15_000 });

    return true;
  }

  private async ensureMasterAndListing(
    organizationId: string,
    row: ScrapedWingRow,
  ): Promise<MasterImageState> {
    const listing = await this.prisma.channelListing.findFirst({
      where: {
        organizationId,
        channel: 'coupang',
        externalId: row.inventoryId,
        isDeleted: false,
      },
      select: {
        id: true,
        masterId: true,
        master: {
          select: {
            imageUrl: true,
            thumbnailUrl: true,
            images: {
              where: { organizationId, isDeleted: false },
              select: { id: true },
              take: 1,
            },
          },
        },
      },
    });

    if (listing) {
      await this.prisma.channelListing.updateMany({
        where: { id: listing.id, organizationId, isDeleted: false },
        data: { channelName: row.name || undefined },
      });
      return { masterId: listing.masterId, hasImage: this.hasDisplayImage(listing.master) };
    }

    return this.prisma.$transaction(async (tx) => {
      const master = await this.masters.create(
        organizationId,
        {
          name: row.name || `쿠팡 인벤토리 ${row.inventoryId}`,
          sourcePlatform: 'coupang',
          sourceUrl: row.url,
        },
        tx,
      );
      await tx.channelListing.create({
        data: {
          organizationId,
          masterId: master.id,
          channel: 'coupang',
          externalId: row.inventoryId,
          channelName: row.name || null,
          status: 'active',
        } satisfies Prisma.ChannelListingUncheckedCreateInput,
      });
      return { masterId: master.id, hasImage: false };
    }, { timeout: 15_000 });
  }

  private listPlaywriterSessions(): Promise<{ ids: string[]; error?: string }> {
    return new Promise((resolve) => {
      const proc = spawn('playwriter', ['session', 'list'], { timeout: 5000 });
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
          .filter((line) => line && !/^no active sessions/i.test(line) && !/^ID\b/i.test(line) && !/^-+$/.test(line))
          .map((line) => line.split(/\s+/)[0])
          .filter((id) => /^[A-Za-z0-9_-]+$/.test(id));
        resolve({ ids });
      });
      proc.on('error', (error: Error) => {
        resolve({ ids: [], error: error.message });
      });
    });
  }

  private async scrapeInventory(sessionId: string): Promise<ScrapedWingRow[]> {
    const outputPath = path.join(os.tmpdir(), `coupang-inventory-${randomUUID()}.json`);
    const code = this.buildScrapeScript(outputPath);

    try {
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(
          'playwriter',
          ['-s', sessionId, '--timeout', '420000', '-e', code],
          { timeout: 480000 },
        );
        let stdout = '';
        let stderr = '';
        proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
        proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
        proc.on('close', () => {
          this.logger.log(`playwriter stdout length=${stdout.length}, hasSUCCESS=${stdout.includes('SUCCESS')}`);
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
      return Array.isArray(parsed) ? parsed.filter(this.isScrapedRow) : [];
    } finally {
      await fs.unlink(outputPath).catch(() => undefined);
    }
  }

  private isScrapedRow(value: unknown): value is ScrapedWingRow {
    if (!value || typeof value !== 'object') return false;
    const row = value as Record<string, unknown>;
    return (
      typeof row.inventoryId === 'string' &&
      typeof row.name === 'string' &&
      typeof row.url === 'string'
    );
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
