import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Prisma, ThumbnailGeneration } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ThumbnailAiService } from './thumbnail-ai.service';
import type { GenerationWithProduct, EditAnalysisResult } from './types';
import { markReady, resetToPending } from './thumbnail-status.helpers';
import { PANEL_EVENTS } from '../../panel/events/panel-events';
import { imagePanelAdapter } from '../../panel/adapters/image.adapter';

const PRODUCT_SELECT = { id: true, name: true, imageUrl: true, coupangProductId: true, category: true } as const;

@Injectable()
export class ThumbnailEditService {
  private readonly logger = new Logger(ThumbnailEditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly thumbnailAiService: ThumbnailAiService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** Panel Live Ops: emit UPSERT after status/phase transition. Fire-and-forget; never throws. */
  private emitPanelUpsert(generation: ThumbnailGeneration | null | undefined, product: { id: string; title: string }): void {
    if (!generation) return;
    try {
      const item = imagePanelAdapter.mapToItem({ generation, product }, generation.companyId);
      this.eventEmitter.emit(PANEL_EVENTS.UPSERT, { item, companyId: generation.companyId });
    } catch (err) {
      this.logger.warn(`Panel emit failed (generation=${generation.id}): ${err}`);
    }
  }

  async createEditJobs(productIds: string[], purpose: 'compliance' | 'quality' = 'compliance'): Promise<GenerationWithProduct[]> {
    const results: GenerationWithProduct[] = [];

    for (const productId of productIds) {
      try {
        // 이미 generating 중이면 skip
        const generatingJob = await this.prisma.thumbnailGeneration.findFirst({
          where: { productId, method: 'edit', status: 'running' },
        });
        if (generatingJob) continue;

        // pending 잡이 있으면 백그라운드 처리 재시작
        const pendingJob = await this.prisma.thumbnailGeneration.findFirst({
          where: { productId, method: 'edit', status: 'pending' },
          include: { product: { select: PRODUCT_SELECT } },
        });
        if (pendingJob) {
          const imageUrl = pendingJob.originalUrl ?? pendingJob.product?.imageUrl ?? null;
          if (imageUrl) {
            setImmediate(() => {
              this.processEditJob(pendingJob.id, imageUrl, pendingJob.product.name, pendingJob.product.category, purpose).catch((err) => {
                this.logger.error(`pending job 재처리 실패 (${pendingJob.id}): ${err instanceof Error ? err.message : err}`);
              });
            });
          }
          results.push({
            ...pendingJob,
            candidates: pendingJob.candidates as Array<{ url: string; filename: string }>,
            editAnalysis: null,
          });
          continue;
        }

        // 이전 실패/건너뛴 job 정리, ready/applied는 보존 (최근 3개까지)
        await this.prisma.thumbnailGeneration.deleteMany({
          where: {
            productId,
            method: 'edit',
            status: { in: ['failed', 'cancelled'] },
          },
        });

        const completedJobs = await this.prisma.thumbnailGeneration.findMany({
          where: { productId, method: 'edit', status: 'succeeded', phase: { in: ['ready', 'applied'] } },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        });
        if (completedJobs.length > 3) {
          const idsToDelete = completedJobs.slice(3).map((j) => j.id);
          await this.prisma.thumbnailGeneration.deleteMany({
            where: { id: { in: idsToDelete } },
          });
        }

        const product = await this.prisma.product.findUnique({
          where: { id: productId },
        });
        if (!product) continue;

        const imageUrl = product.imageUrl ?? null;
        if (!imageUrl) continue;

        // triggeredByUserId NULL — createEditJobs는 @CurrentUser 없이 호출됨 (thumbnail-analysis.controller)
        const generation = await this.prisma.thumbnailGeneration.create({
          data: {
            productId,
            companyId: product.companyId,
            originalUrl: imageUrl,
            method: 'edit',
            status: 'pending',
          },
          include: { product: { select: PRODUCT_SELECT } },
        });

        // Panel Live Ops: emit on create (source visible at creation, status=pending)
        this.emitPanelUpsert(generation, { id: product.id, title: product.name });

        const result: GenerationWithProduct = {
          ...generation,
          candidates: generation.candidates as Array<{ url: string; filename: string }>,
          editAnalysis: null,
        };
        results.push(result);

        // 백그라운드 처리 시작
        setImmediate(() => {
          this.processEditJob(generation.id, imageUrl, product.name, product.category, purpose).catch((err) => {
            this.logger.error(`편집 job 백그라운드 처리 실패 (${generation.id}): ${err instanceof Error ? err.message : err}`);
          });
        });
      } catch (error) {
        this.logger.error(`편집 job 생성 실패 (product: ${productId}): ${error instanceof Error ? error.message : error}`);
      }
    }

    return results;
  }

  /** after 이미지가 깨진 ready/applied 잡을 즉시 재편집 */
  async reEditJob(generationId: string, purpose: 'compliance' | 'quality' = 'compliance'): Promise<{ ok: true }> {
    const job = await this.prisma.thumbnailGeneration.findUnique({
      where: { id: generationId },
      include: { product: { select: PRODUCT_SELECT } },
    });
    if (!job) return { ok: true };

    const imageUrl = job.originalUrl ?? job.product?.imageUrl ?? null;
    if (!imageUrl) return { ok: true };

    const reset = await resetToPending(this.prisma, generationId, { candidates: [], selectedUrl: null });

    // Panel Live Ops: emit on reset to pending (phase transition)
    this.emitPanelUpsert(reset, { id: job.product.id, title: job.product.name });

    setImmediate(() => {
      this.processEditJob(generationId, imageUrl, job.product.name, job.product.category, purpose).catch((err) => {
        this.logger.error(`재편집 실패 (${generationId}): ${err instanceof Error ? err.message : err}`);
      });
    });

    return { ok: true };
  }

  private static readonly EDIT_TIMEOUT_MS = 5 * 60 * 1000; // 5분

  /**
   * Edit job state transitions:
   *   (caller state)                   (processEditJob writes)
   *   pending|running  ─────────►  running (phase=null)
   *     │                              │
   *     │                              ├─► succeeded + phase='ready'   (markReady, happy path)
   *     │                              ├─► failed + phase=null          (0 candidates / timeout / generic error)
   *     │
   *     reEditJob: succeeded+{ready|applied} ─► pending+phase=null (resetToPending)
   */
  private async processEditJob(
    generationId: string,
    imageUrl: string,
    productName: string,
    category: string | null,
    purpose: 'compliance' | 'quality' = 'compliance',
  ): Promise<void> {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('편집 타임아웃 (5분 초과)')), ThumbnailEditService.EDIT_TIMEOUT_MS),
    );

    // Fetch generation (with product) once for all panel emits in this job.
    // One extra query per job; acceptable — not in hot loop.
    const genForProduct = await this.prisma.thumbnailGeneration.findUnique({
      where: { id: generationId },
      select: { productId: true, companyId: true, product: { select: { id: true, name: true } } },
    });
    const productCtx = genForProduct?.product
      ? { id: genForProduct.product.id, title: genForProduct.product.name }
      : null;

    try {
      const runningRow = await this.prisma.thumbnailGeneration.update({
        where: { id: generationId },
        data: { status: 'running', phase: null },
      });

      // Panel Live Ops: status transition pending → running
      if (productCtx) this.emitPanelUpsert(runningRow, productCtx);

      // 1. 이미지 편집 (타임아웃 적용)
      const candidates = await Promise.race([
        this.thumbnailAiService.editImage(imageUrl, generationId, purpose),
        timeout,
      ]);

      if (candidates.length === 0) {
        const failedRow = await this.prisma.thumbnailGeneration.update({
          where: { id: generationId },
          data: { status: 'failed', phase: null },
        });
        // Panel Live Ops: status transition running → failed (0 candidates)
        if (productCtx) this.emitPanelUpsert(failedRow, productCtx);
        return;
      }

      // 2. 편집된 이미지 가이드라인 재체크 (품질 평가 불필요)
      let editAnalysis: EditAnalysisResult | null = null;
      const firstCandidate = candidates[0];
      if (firstCandidate) {
        const complianceMap = await this.thumbnailAiService.checkCompliance([{
          imageUrl: firstCandidate.url,
          productName,
          productId: generationId,
          category: category ?? undefined,
        }]);
        const compliance = complianceMap.get(generationId) ?? null;
        if (compliance) {
          editAnalysis = {
            complianceGrade: compliance.complianceGrade,
            complianceScores: compliance.complianceScores as unknown as Record<string, unknown> | null,
            overallScore: 0,
            grade: '',
          };
        }
      }

      // 3. 결과 저장
      const readyRow = await markReady(this.prisma, generationId, {
        candidates: candidates as unknown as Prisma.InputJsonValue,
        editAnalysis: editAnalysis as unknown as Prisma.InputJsonValue,
      });
      // Panel Live Ops: phase transition running → succeeded+ready
      if (productCtx) this.emitPanelUpsert(readyRow, productCtx);
    } catch (error) {
      this.logger.error(`편집 처리 실패 (${generationId}): ${error instanceof Error ? error.message : error}`);
      await this.prisma.thumbnailGeneration.update({
        where: { id: generationId },
        data: { status: 'failed', phase: null },
      }).then((failedRow) => {
        // Panel Live Ops: status transition → failed (timeout / generic error)
        if (productCtx) this.emitPanelUpsert(failedRow, productCtx);
      }).catch(() => {});
    }
  }
}
