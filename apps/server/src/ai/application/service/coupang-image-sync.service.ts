import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { StorageService } from '../../../common/storage/storage.service';
import { ThumbnailImageFetcherService } from '../../adapter/out/image-fetch/thumbnail-image-fetcher.adapter';
import {
  COUPANG_INVENTORY_SCRAPE_PORT,
  type CoupangInventoryRow,
  type CoupangInventoryScrapePort,
} from '../port/out/coupang-inventory-scrape.port';
import {
  MASTER_CATALOG_PORT,
  type MasterCatalogPort,
} from '../port/out/master-catalog.port';

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

const JOB_TTL_MS = 30 * 60 * 1000;

/**
 * Coupang Wing 인벤토리 페이지에서 상품 이미지를 스크래핑해서 MasterProduct 의
 * primary image 로 첨부하는 잡을 시작/조회.
 *
 * Architecture (apps/server/AGENTS.md):
 *  - cross-domain `products` 접근은 `MASTER_CATALOG_PORT` 를 통해서만.
 *  - playwriter subprocess + filesystem 의존은 `COUPANG_INVENTORY_SCRAPE_PORT`
 *    뒤에 격리.
 *  - 이 service 는 use-case orchestration 만 담당 — 외부 의존 없음.
 *
 * Single-instance assumption:
 *  - in-memory `jobs` Map 으로 상태 관리. 멀티 인스턴스 환경에서는 잡 상태가
 *    인스턴스별로 갈리고, 백엔드 재시작 시 sliding window 안의 모든 in-flight
 *    잡 상태가 사라진다 (frontend useCoupangImageSync 의 `statusQuery.error`
 *    핸들러가 localStorage jobId 를 자동 reset 해서 graceful 회복).
 *  - prod 멀티 인스턴스 환경에서는 ChannelScrapeRun 같은 DB-backed job table
 *    로 마이그레이션 필요 (transitional shortcut).
 */
@Injectable()
export class CoupangImageSyncService {
  private readonly logger = new Logger(CoupangImageSyncService.name);
  private readonly jobs = new Map<string, CoupangImageSyncJobState>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly imageFetcher: ThumbnailImageFetcherService,
    @Inject(COUPANG_INVENTORY_SCRAPE_PORT)
    private readonly scraper: CoupangInventoryScrapePort,
    @Inject(MASTER_CATALOG_PORT)
    private readonly catalog: MasterCatalogPort,
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

    const scrapedRows = await this.scraper.scrapeAll();
    const uniqueRows = dedupeRows(scrapedRows);
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

  private async filterRowsNeedingImage(
    organizationId: string,
    rows: CoupangInventoryRow[],
  ): Promise<CoupangInventoryRow[]> {
    const targets: CoupangInventoryRow[] = [];
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
      if (!listing || !hasDisplayImage(listing.master)) targets.push(row);
    }
    return targets;
  }

  private async syncOne(organizationId: string, row: CoupangInventoryRow): Promise<boolean> {
    const handle = await this.catalog.ensureCoupangMaster({
      organizationId,
      inventoryId: row.inventoryId,
      name: row.name,
      sourceUrl: row.url,
    });
    if (handle.hasImage) return false;

    const fetched = await this.imageFetcher.fetchImage(row.url);
    const ext = this.imageFetcher.extForMime(fetched.mimeType);
    const key = `product-images/${handle.masterId}/coupang-${Date.now()}.${ext}`;
    const publicUrl = await this.storage.save(key, fetched.buffer, fetched.mimeType);

    return this.catalog.attachPrimaryImage({
      organizationId,
      masterId: handle.masterId,
      storageKey: key,
      url: publicUrl,
      mimeType: fetched.mimeType,
      fileSize: fetched.buffer.length,
      sourceUrl: row.url,
    });
  }
}

/**
 * Pure helper — exported for unit test.
 * 같은 inventoryId 중복 제거. 빈 inventoryId / url 도 제거.
 */
export function dedupeRows(rows: CoupangInventoryRow[]): CoupangInventoryRow[] {
  const seen = new Set<string>();
  const out: CoupangInventoryRow[] = [];
  for (const row of rows) {
    if (!row.inventoryId || !row.url) continue;
    if (seen.has(row.inventoryId)) continue;
    seen.add(row.inventoryId);
    out.push(row);
  }
  return out;
}

/**
 * Pure helper — exported for unit test.
 */
export function hasDisplayImage(master: {
  imageUrl: string | null;
  thumbnailUrl: string | null;
  images: Array<{ id: string }>;
}): boolean {
  return Boolean(master.imageUrl || master.thumbnailUrl || master.images.length > 0);
}
