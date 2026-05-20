import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import {
  AI_OPERATION_ALERT_PORT,
  type OperationAlertPort,
} from '../port/out/cross-domain/operation-alert.port';
import {
  COUPANG_INVENTORY_SCRAPE_PORT,
  type CoupangInventoryRow,
  type CoupangInventoryRowSource,
  type CoupangInventoryScrapePort,
} from '../port/out/provider/coupang-inventory-scrape.port';
import {
  MASTER_CATALOG_PORT,
  type MasterCatalogPort,
} from '../port/out/cross-domain/master-catalog.port';
import {
  COUPANG_IMAGE_RECONCILIATION_PORT,
  type CoupangImageReconciliationPort,
} from '../port/out/cross-domain/coupang-image-reconciliation.port';
import { assertPublicHttpUrl } from '../../../common/security/public-url';
import type { CoupangImageSyncCapabilities } from '@kiditem/shared/ai';

export type CoupangImageSyncJobStatus = 'running' | 'done' | 'failed';

export interface CoupangImageSyncJobState {
  jobId: string;
  organizationId: string;
  actorUserId: string | null;
  source: CoupangInventoryRowSource;
  status: CoupangImageSyncJobStatus;
  phase: 'starting' | 'scraping' | 'linking' | 'finished';
  total: number;
  processed: number;
  succeeded: number;
  unmatched: number;
  failed: number;
  startedAt: number;
  finishedAt: number | null;
  error: string | null;
}

const JOB_TTL_MS = 30 * 60 * 1000;
const OPERATION_KEY_PREFIX = 'coupang-image-sync:';
const OPERATION_HREF = '/product-pipeline/thumbnail-generation';
export const COUPANG_IMAGE_SYNC_ALERT_START_TIMEOUT_MS = 2_000;
export const COUPANG_IMAGE_SYNC_STALE_ALERT_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * Coupang Wing 인벤토리 페이지에서 상품 이미지 URL 을 스크래핑해서
 * MasterProduct 의 primary image metadata 로 첨부하는 잡을 시작/조회.
 *
 * Architecture (apps/server/AGENTS.md):
 *  - cross-domain `products` 접근은 `MASTER_CATALOG_PORT` 를 통해서만.
 *  - playwriter subprocess + filesystem 의존은 `COUPANG_INVENTORY_SCRAPE_PORT`
 *    뒤에 격리.
 *  - 원본 이미지는 외부 URL metadata 로만 연결하고, binary fetch/storage 는 하지 않는다.
 *  - 이 service 는 use-case orchestration 만 담당.
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
export class CoupangImageSyncService implements OnModuleInit {
  private readonly logger = new Logger(CoupangImageSyncService.name);
  private readonly jobs = new Map<string, CoupangImageSyncJobState>();

  constructor(
    @Inject(COUPANG_INVENTORY_SCRAPE_PORT)
    private readonly scraper: CoupangInventoryScrapePort,
    @Inject(MASTER_CATALOG_PORT)
    private readonly catalog: MasterCatalogPort,
    @Inject(COUPANG_IMAGE_RECONCILIATION_PORT)
    private readonly reconciliation: CoupangImageReconciliationPort,
    @Inject(AI_OPERATION_ALERT_PORT)
    private readonly operationAlerts: OperationAlertPort,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.closeStaleRunningAlerts();
  }

  start(
    organizationId: string,
    actorUserId: string | null = null,
  ): { jobId: string } {
    const job = this.createJob(organizationId, actorUserId, 'server_scraper');

    this.runAfterAlertStart(job, () => this.runFromScraper(job));

    return { jobId: job.jobId };
  }

  getCapabilities(): CoupangImageSyncCapabilities {
    const serverScraper = this.scraper.getCapabilities();
    return {
      extensionRows: {
        source: 'extension',
        enabled: true,
      },
      serverScraper,
      preferredSource: serverScraper.enabled ? 'server_scraper' : 'extension',
    } satisfies CoupangImageSyncCapabilities;
  }

  private async closeStaleRunningAlerts(): Promise<void> {
    try {
      const closed = await this.operationAlerts.closeStaleOperations({
        sourceType: 'coupang_image_sync',
        operationKeyPrefix: OPERATION_KEY_PREFIX,
        staleBefore: new Date(Date.now() - COUPANG_IMAGE_SYNC_STALE_ALERT_TTL_MS),
        status: 'failed',
        message: '쿠팡 이미지 동기화가 서버 재시작/배포 중 중단되어 자동 종료되었습니다.',
        metadata: {
          phase: 'finished',
          staleReconciled: true,
        },
      });
      if (closed.length > 0) {
        this.logger.warn(`Closed ${closed.length} stale Coupang image sync operation alert(s)`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to close stale Coupang image sync operation alerts: ${message}`);
    }
  }

  startFromRows(
    organizationId: string,
    rows: CoupangInventoryRow[],
    actorUserId: string | null = null,
  ): { jobId: string } {
    const job = this.createJob(organizationId, actorUserId, 'extension');

    this.runAfterAlertStart(job, () => this.runFromRows(job, rows, 'extension'));

    return { jobId: job.jobId };
  }

  private createJob(
    organizationId: string,
    actorUserId: string | null,
    source: CoupangInventoryRowSource,
  ): CoupangImageSyncJobState {
    for (const job of this.jobs.values()) {
      if (job.organizationId === organizationId && job.status === 'running') {
        throw new ConflictException('이미 진행 중인 동기화 잡이 있습니다');
      }
    }

    const jobId = randomUUID();
    const job: CoupangImageSyncJobState = {
      jobId,
      organizationId,
      actorUserId,
      source,
      status: 'running',
      phase: 'starting',
      total: 0,
      processed: 0,
      succeeded: 0,
      unmatched: 0,
      failed: 0,
      startedAt: Date.now(),
      finishedAt: null,
      error: null,
    };
    this.jobs.set(jobId, job);

    return job;
  }

  private runAfterAlertStart(
    job: CoupangImageSyncJobState,
    run: () => Promise<void>,
  ): void {
    void (async () => {
      await this.waitForAlertStartBestEffort(job);
      await run();
    })().catch((error: unknown) => {
      this.failJob(job, error);
    });
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

  private failJob(job: CoupangImageSyncJobState, error: unknown): void {
    job.status = 'failed';
    job.phase = 'finished';
    job.error = error instanceof Error ? error.message : String(error);
    job.finishedAt = Date.now();
    this.logger.error(`Coupang image sync job ${job.jobId} failed: ${job.error}`);
    void this.notifyAlertFail(job);
  }

  private async runFromScraper(job: CoupangImageSyncJobState): Promise<void> {
    job.phase = 'scraping';
    void this.notifyAlertProgress(job);

    const scrapedRows = await this.scraper.scrapeAll();
    await this.runFromRows(job, scrapedRows, 'server_scraper');
  }

  private async runFromRows(
    job: CoupangImageSyncJobState,
    rows: CoupangInventoryRow[],
    source: CoupangInventoryRowSource,
  ): Promise<void> {
    const { organizationId } = job;
    job.source = source;
    const uniqueRows = dedupeRows(rows, source);
    await this.reconciliation.recordRows({ organizationId, rows: uniqueRows });
    const targets = await this.filterRowsNeedingImage(organizationId, uniqueRows);

    job.total = targets.length;
    job.phase = 'linking';
    void this.notifyAlertProgress(job);

    if (job.total === 0) {
      job.status = 'done';
      job.phase = 'finished';
      job.finishedAt = Date.now();
      void this.notifyAlertSucceed(job);
      return;
    }

    for (const row of targets) {
      try {
        const result = await this.syncOne(organizationId, row);
        if (result === 'synced') job.succeeded += 1;
        if (result === 'unmatched') job.unmatched += 1;
      } catch (error: unknown) {
        job.failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Wing inventory ${row.inventoryId} image sync skipped: ${message}`);
      } finally {
        job.processed += 1;
      }
    }

    job.status = 'done';
    job.phase = 'finished';
    job.finishedAt = Date.now();
    void this.notifyAlertSucceed(job);
  }

  // ── Operation alert lifecycle (panel projection) ─────────────────────────
  // The job is single-instance (in-memory map), so the alert ledger is the
  // only place the user can track state if they leave thumbnail generation. Alert
  // emit failures are swallowed so the sync keeps running; the worst case
  // is a stale "running" badge, which the FE polling reset will clear.

  private alertOperationKey(job: CoupangImageSyncJobState): string {
    return `${OPERATION_KEY_PREFIX}${job.jobId}`;
  }

  private alertMetadata(job: CoupangImageSyncJobState): Record<string, unknown> {
    return {
      jobId: job.jobId,
      source: job.source,
      phase: job.phase,
      total: job.total,
      processed: job.processed,
      succeeded: job.succeeded,
      unmatched: job.unmatched,
      failed: job.failed,
    };
  }

  private alertProgressFraction(
    job: CoupangImageSyncJobState,
  ): number | null {
    if (job.total === 0) return null;
    return Math.max(0, Math.min(1, job.processed / job.total));
  }

  private async waitForAlertStartBestEffort(
    job: CoupangImageSyncJobState,
  ): Promise<void> {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let timedOut = false;

    const alertStart = this.notifyAlertStart(job);
    const timeoutPromise = new Promise<void>((resolve) => {
      timeout = setTimeout(() => {
        timedOut = true;
        this.logger.warn(
          `coupang_image_sync alert start timed out (job=${job.jobId}); continuing sync job`,
        );
        resolve();
      }, COUPANG_IMAGE_SYNC_ALERT_START_TIMEOUT_MS);
      if (typeof timeout === 'object' && typeof timeout.unref === 'function') {
        timeout.unref();
      }
    });

    await Promise.race([alertStart, timeoutPromise]);
    if (timeout && !timedOut) clearTimeout(timeout);
    if (timedOut) {
      void alertStart.then(() => this.notifyAlertCurrentState(job));
    }
  }

  private async notifyAlertCurrentState(
    job: CoupangImageSyncJobState,
  ): Promise<void> {
    if (job.status === 'done') {
      await this.notifyAlertSucceed(job);
      return;
    }
    if (job.status === 'failed') {
      await this.notifyAlertFail(job);
      return;
    }
    await this.notifyAlertProgress(job);
  }

  private async notifyAlertStart(
    job: CoupangImageSyncJobState,
  ): Promise<void> {
    try {
      await this.operationAlerts.start({
        organizationId: job.organizationId,
        operationKey: this.alertOperationKey(job),
        type: 'coupang_image_sync',
        title: '쿠팡 Wing 이미지 동기화',
        message: '쿠팡 Wing 인벤토리에서 상품 이미지 URL을 연결하는 중입니다.',
        sourceType: 'coupang_image_sync',
        sourceId: job.jobId,
        actorUserId: job.actorUserId,
        href: OPERATION_HREF,
        metadata: this.alertMetadata(job),
      });
    } catch (err) {
      this.logger.warn(
        `coupang_image_sync alert start failed (job=${job.jobId}): ${err}`,
      );
    }
  }

  private async notifyAlertProgress(
    job: CoupangImageSyncJobState,
  ): Promise<void> {
    try {
      await this.operationAlerts.progress(
        job.organizationId,
        this.alertOperationKey(job),
        {
          progress: this.alertProgressFraction(job),
          metadata: this.alertMetadata(job),
        },
      );
    } catch (err) {
      this.logger.warn(
        `coupang_image_sync alert progress failed (job=${job.jobId}): ${err}`,
      );
    }
  }

  private async notifyAlertSucceed(
    job: CoupangImageSyncJobState,
  ): Promise<void> {
    const allSkipped = job.total === 0;
    try {
      await this.operationAlerts.succeed(
        job.organizationId,
        this.alertOperationKey(job),
        {
          message: allSkipped
            ? '동기화 대상이 없어 변경 사항 없이 완료되었습니다.'
            : `이미지 ${job.succeeded}건 동기화 완료 (대상 ${job.total}건 / 미매칭 ${job.unmatched}건 / 실패 ${job.failed}건).`,
          metadata: this.alertMetadata(job),
        },
      );
    } catch (err) {
      this.logger.warn(
        `coupang_image_sync alert succeed failed (job=${job.jobId}): ${err}`,
      );
    }
  }

  private async notifyAlertFail(
    job: CoupangImageSyncJobState,
  ): Promise<void> {
    try {
      await this.operationAlerts.fail(
        job.organizationId,
        this.alertOperationKey(job),
        {
          message: job.error ?? '쿠팡 Wing 이미지 동기화 실패',
          metadata: this.alertMetadata(job),
        },
      );
    } catch (err) {
      this.logger.warn(
        `coupang_image_sync alert fail emit failed (job=${job.jobId}): ${err}`,
      );
    }
  }

  private async filterRowsNeedingImage(
    organizationId: string,
    rows: CoupangInventoryRow[],
  ): Promise<CoupangInventoryRow[]> {
    if (rows.length === 0) return [];

    const inventoryIds = rows.map((row) => row.inventoryId);
    const imageStates = await this.catalog.findCoupangListingImageStates({
      organizationId,
      inventoryIds,
    });

    const imageStateByInventoryId = new Map(
      imageStates.map((state) => [state.inventoryId, state]),
    );

    return rows.filter((row) => {
      const imageState = imageStateByInventoryId.get(row.inventoryId);
      return !imageState || !imageState.hasImage;
    });
  }

  private async syncOne(
    organizationId: string,
    row: CoupangInventoryRow,
  ): Promise<'synced' | 'unchanged' | 'unmatched'> {
    assertPublicHttpUrl(row.url);

    const handle = await this.catalog.findCoupangMaster({
      organizationId,
      inventoryId: row.inventoryId,
      legacyCode: row.legacyCode,
      name: row.name,
    });
    if (!handle) return 'unmatched';
    if (handle.hasImage) return 'unchanged';

    const attached = await this.catalog.attachPrimaryImage({
      organizationId,
      masterId: handle.masterId,
      storageKey: null,
      url: row.url,
      mimeType: null,
      fileSize: null,
    });
    return attached ? 'synced' : 'unchanged';
  }
}

/**
 * Pure helper — exported for unit test.
 * 같은 inventoryId 중복 제거. 빈 inventoryId / url 도 제거.
 */
export function dedupeRows(
  rows: CoupangInventoryRow[],
  source: CoupangInventoryRowSource,
): CoupangInventoryRow[] {
  const seen = new Set<string>();
  const out: CoupangInventoryRow[] = [];
  for (const row of rows) {
    if (!row.inventoryId || !row.url) continue;
    if (seen.has(row.inventoryId)) continue;
    seen.add(row.inventoryId);
    out.push({ ...row, source });
  }
  return out;
}
