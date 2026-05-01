import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ThumbnailGenerationItem,
  ThumbnailGenerationListResponse,
} from '@kiditem/shared/ai';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  ThumbnailEditorAiService,
} from './thumbnail-editor-ai.service';
import type {
  ThumbnailEditorCandidate,
  ThumbnailEditorInputImage,
} from '../../domain/model/thumbnail-editor';
import { resolveMasterThumbnailImage } from '../../domain/thumbnail-master-image';
import { getRecomposePromptOverride } from '../../domain/prompts/thumbnail-recompose-prompts';
import { ThumbnailTrackingService } from './thumbnail-tracking.service';
import {
  type ThumbnailAnalysisContext,
  extractEditSuggestions,
  extractRecomposeKind,
  findRecomposeKindIn,
  inferEditCaseFromInputs,
  toAnalysisContextJson,
  toEditAnalysis,
  toInputRole,
  variantInstruction,
} from '../../domain/thumbnail-generation-inputs';
import {
  toThumbnailGenerationItem,
  type GenerationRow,
} from '../../mapper/thumbnail-generation.mapper';
import {
  findActiveJobForProduct,
  findAutoBatchCandidates,
  findGenerationMaster,
  findGenerationMasters,
  findGenerationOrThrow,
  findGenerationRows,
  findGenerationWithCandidatesOrThrow,
  findGenerationWithInputImages,
  findJobMaster,
  findJobMastersByIds,
  findProductForEditor,
  findRecentAutoJob,
  findThumbnailAnalysisGrade,
  type EditorProductRow,
} from '../../adapter/out/prisma/thumbnail-generation.query';
import {
  applyGenerationToMaster,
  createPendingEditJob,
  deleteGeneration,
  lockGenerationForProcessing,
  markGenerationCancelled,
  markGenerationFailed,
  removeCandidate as removeCandidatePersistence,
  replaceGenerationResult,
  resetGenerationForReEdit,
  saveEditorResult as saveEditorResultPersistence,
  setSelectedCandidate,
  type SaveEditorResultInput,
} from '../../adapter/out/prisma/thumbnail-generation.persistence';

@Injectable()
export class ThumbnailGenerationService {
  private readonly logger = new Logger(ThumbnailGenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly editorAiService: ThumbnailEditorAiService,
    private readonly trackingService: ThumbnailTrackingService,
  ) {}

  async findProductForEditor(
    productId: string,
    organizationId: string,
  ): Promise<EditorProductRow | null> {
    return findProductForEditor(this.prisma, productId, organizationId);
  }

  async saveEditorResult(input: SaveEditorResultInput): Promise<string> {
    await this.assertProductOwned(input.productId, input.organizationId);
    return saveEditorResultPersistence(this.prisma, input);
  }

  async findAll(
    organizationId: string,
    opts: { productId?: string | null; limit?: number | null } = {},
  ): Promise<ThumbnailGenerationListResponse> {
    const rows = await findGenerationRows(this.prisma, organizationId, opts);
    const masters = await findGenerationMasters(this.prisma, rows, organizationId);
    const items = rows.map((r) => toThumbnailGenerationItem(r, masters.get(r.masterId)));
    return { items, total: items.length } satisfies ThumbnailGenerationListResponse;
  }

  async findOne(id: string, organizationId: string): Promise<ThumbnailGenerationItem> {
    const row = await findGenerationOrThrow(this.prisma, id, organizationId);
    const master = await findGenerationMaster(this.prisma, row.masterId, organizationId);
    return toThumbnailGenerationItem(row, master);
  }

  async selectCandidate(
    id: string,
    organizationId: string,
    selectedUrl: string,
  ): Promise<ThumbnailGenerationItem> {
    const existing = await findGenerationWithCandidatesOrThrow(this.prisma, id, organizationId);
    const isDeselect = !selectedUrl;
    if (!isDeselect && !existing.candidates.some((c) => c.url === selectedUrl)) {
      throw new BadRequestException('selectedUrl 은 해당 generation 의 candidates 중 하나여야 합니다');
    }
    await setSelectedCandidate(this.prisma, id, organizationId, isDeselect ? null : selectedUrl);
    return this.findOne(id, organizationId);
  }

  async applyGeneration(id: string, organizationId: string): Promise<ThumbnailGenerationItem> {
    const existing = await findGenerationWithCandidatesOrThrow(this.prisma, id, organizationId);
    const master = await findGenerationMaster(this.prisma, existing.masterId, organizationId);
    if (!master) throw new NotFoundException(`MasterProduct ${existing.masterId} not found`);

    const matchedCandidate = existing.candidates.find((c) => c.url === existing.selectedUrl);
    const selected = matchedCandidate
      ? {
          url: matchedCandidate.url,
          storageKey: matchedCandidate.storageKey,
          mimeType: matchedCandidate.mimeType ?? null,
          width: matchedCandidate.width ?? null,
          height: matchedCandidate.height ?? null,
          fileSize: matchedCandidate.fileSize ?? null,
        }
      : existing.selectedUrl
        ? { url: existing.selectedUrl, storageKey: null }
        : null;

    await applyGenerationToMaster(this.prisma, {
      id,
      organizationId,
      masterId: existing.masterId,
      selected,
    });

    const analysis = await findThumbnailAnalysisGrade(this.prisma, existing.masterId, organizationId);
    void this.trackingService
      .create({
        organizationId,
        masterId: existing.masterId,
        generationId: existing.id,
        originalGrade: analysis?.grade ?? existing.grade,
        originalScore: analysis?.overallScore ?? existing.score,
      })
      .catch((err) => {
        this.logger.warn(
          `ThumbnailTracking 자동 생성 실패 (generationId=${existing.id}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });

    return this.findOne(id, organizationId);
  }

  async skipGeneration(id: string, organizationId: string): Promise<ThumbnailGenerationItem> {
    await this.assertGenerationOwned(id, organizationId);
    await markGenerationCancelled(this.prisma, id, organizationId);
    return this.findOne(id, organizationId);
  }

  async deleteGeneration(id: string, organizationId: string): Promise<{ ok: true }> {
    await this.assertGenerationOwned(id, organizationId);
    await deleteGeneration(this.prisma, id, organizationId);
    return { ok: true };
  }

  async removeCandidate(
    id: string,
    organizationId: string,
    candidateUrl: string,
  ): Promise<{ ok: true; generationDeleted: boolean; remaining: number }> {
    const existing = await findGenerationWithCandidatesOrThrow(this.prisma, id, organizationId);
    const target = existing.candidates.find((c) => c.url === candidateUrl);
    if (!target) {
      throw new NotFoundException('해당 candidate URL 을 찾을 수 없습니다');
    }
    const remaining = existing.candidates.length - 1;
    await removeCandidatePersistence(this.prisma, {
      id,
      organizationId,
      candidateId: target.id,
      candidateUrl,
      selectedUrl: existing.selectedUrl,
      remainingAfterDelete: remaining,
    });
    return { ok: true, generationDeleted: remaining === 0, remaining };
  }

  async createEditJobs(
    productIds: string[],
    organizationId: string,
    purpose: 'compliance' | 'quality',
    variantKey: 'auto' | 'with-box' | 'no-box' | null,
    method = 'generate',
  ): Promise<ThumbnailGenerationItem[]> {
    if (productIds.length === 0) return [];
    const byId = await findJobMastersByIds(this.prisma, productIds, organizationId);
    const items: ThumbnailGenerationItem[] = [];

    for (const productId of productIds) {
      const product = byId.get(productId);
      if (!product) throw new NotFoundException(`MasterProduct ${productId} not found`);
      const sourceUrl = resolveMasterThumbnailImage(product);
      if (!sourceUrl) throw new BadRequestException('상품 원본 이미지가 필요합니다');

      const active = await findActiveJobForProduct(this.prisma, product.id, organizationId, method);
      if (active) {
        items.push(toThumbnailGenerationItem(active, product));
        continue;
      }

      const analysis: ThumbnailAnalysisContext | null = product.thumbnailAnalyses[0] ?? null;
      const editSuggestions = extractEditSuggestions(analysis?.complianceScores ?? null);
      const editAnalysis = toEditAnalysis(analysis);

      const generation = await createPendingEditJob(this.prisma, {
        organizationId,
        masterId: product.id,
        originalUrl: sourceUrl,
        method,
        inputMeta: {
          mode: 'edit',
          purpose,
          editCase: 'single',
          variantKey: variantKey ?? 'auto',
          automated: method === 'auto',
          inputCount: 1,
          recompose: (analysis?.recompose ?? null) as Prisma.InputJsonValue,
          analysisContext: toAnalysisContextJson(analysis, editSuggestions),
        },
        editAnalysis,
      });
      this.scheduleEditJob(generation.id, organizationId, purpose, variantKey);
      items.push(toThumbnailGenerationItem(generation, product));
    }
    return items;
  }

  async reEditJob(
    id: string,
    organizationId: string,
    purpose: 'compliance' | 'quality',
    variantKey: 'auto' | 'with-box' | 'no-box' | null,
  ): Promise<{ ok: true }> {
    await this.assertGenerationOwned(id, organizationId);
    await resetGenerationForReEdit(this.prisma, { id, organizationId, purpose, variantKey });
    this.scheduleEditJob(id, organizationId, purpose, variantKey);
    return { ok: true };
  }

  private scheduleEditJob(
    generationId: string,
    organizationId: string,
    purpose: 'compliance' | 'quality',
    variantKey: 'auto' | 'with-box' | 'no-box' | null,
  ): void {
    setImmediate(() => {
      this.processEditJob(generationId, organizationId, purpose, variantKey).catch((err) => {
        this.logger.error(
          `편집 job 백그라운드 처리 실패 (${generationId}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });
    });
  }

  private async processEditJob(
    id: string,
    organizationId: string,
    purpose: 'compliance' | 'quality',
    variantKey: 'auto' | 'with-box' | 'no-box' | null,
  ): Promise<void> {
    const locked = await lockGenerationForProcessing(this.prisma, id, organizationId);
    if (!locked) return;

    try {
      const existing = await findGenerationWithInputImages(this.prisma, id, organizationId);
      if (!existing) return;
      const master = await findJobMaster(this.prisma, existing.masterId, organizationId);
      if (!master) {
        throw new BadRequestException('상품 정보를 찾을 수 없습니다');
      }

      const masterFallback = resolveMasterThumbnailImage(master);
      const seedRows =
        existing.inputImages.length > 0
          ? existing.inputImages
          : [
              {
                url: existing.selectedUrl ?? existing.originalUrl ?? masterFallback,
                role: 'product',
                label: 'Product photo',
                sortOrder: 0,
                source: 'master_image',
              },
            ];
      const validSeedRows = seedRows.filter((row) => row.url);
      if (validSeedRows.length === 0) {
        throw new BadRequestException('재편집할 원본 이미지가 없습니다');
      }

      const inputImages: ThumbnailEditorInputImage[] = [];
      for (const row of validSeedRows) {
        inputImages.push(
          await this.editorAiService.resolveInputImage(row.url as string, organizationId, {
            label: row.label ?? 'Product photo',
            role: toInputRole(row.role),
            sortOrder: row.sortOrder,
            source: row.source ?? 're-edit',
          }),
        );
      }
      const editCase = inferEditCaseFromInputs(inputImages);
      const analysis: ThumbnailAnalysisContext | null = master.thumbnailAnalyses[0] ?? null;
      const recomposeKind =
        findRecomposeKindIn(existing.inputMeta) ??
        findRecomposeKindIn(existing.editAnalysis) ??
        extractRecomposeKind(analysis?.recompose ?? null);
      const editSuggestions = extractEditSuggestions(analysis?.complianceScores ?? null);
      const promptOverride = getRecomposePromptOverride(
        recomposeKind,
        variantKey,
        master.category,
      );
      const candidates: ThumbnailEditorCandidate[] = await this.editorAiService.generateEdit(
        inputImages,
        organizationId,
        {
          purpose,
          editCase,
          userPrompt: promptOverride ? undefined : variantInstruction(variantKey),
          productDescription: [master.name, master.category]
            .filter(Boolean)
            .join(' / '),
          productName: master.name,
          category: master.category,
          promptOverride,
          editSuggestions,
          referenceMode: 'edit-image',
        },
      );

      const inputMeta: Prisma.InputJsonValue = {
        mode: 'edit',
        purpose,
        editCase,
        variantKey: variantKey ?? 'auto',
        automated: existing.method === 'auto',
        inputCount: inputImages.length,
        recompose: (analysis?.recompose ?? null) as Prisma.InputJsonValue,
        analysisContext: toAnalysisContextJson(analysis, editSuggestions),
      };
      await replaceGenerationResult(this.prisma, {
        generationId: id,
        organizationId,
        candidates,
        inputImages,
        inputMeta,
        editAnalysis: toEditAnalysis(analysis),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`편집 처리 실패 (${id}): ${message}`);
      await markGenerationFailed(this.prisma, id, organizationId, message);
    }
  }

  async createAutoBatch(
    organizationId: string,
    limit = 30,
  ): Promise<{
    attempted: number;
    succeeded: number;
    failed: number;
    skipped: number;
    runs: Array<{ ok: boolean; productId: string; generationId?: string | null; error?: string }>;
  }> {
    const take = Math.min(Math.max(limit, 1), 30);
    const cooldown = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const products = await findAutoBatchCandidates(this.prisma, organizationId, take * 3);

    const runs: Array<{ ok: boolean; productId: string; generationId?: string | null; error?: string }> = [];
    let skipped = 0;
    for (const product of products) {
      if (runs.length >= take) break;
      const recent = await findRecentAutoJob(this.prisma, product.id, organizationId, cooldown);
      if (recent) {
        skipped++;
        continue;
      }
      try {
        const [item] = await this.createEditJobs([product.id], organizationId, 'compliance', 'auto', 'auto');
        runs.push({ ok: true, productId: product.id, generationId: item?.id ?? null });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`[thumbnail-auto] failed productId=${product.id}: ${message}`);
        runs.push({ ok: false, productId: product.id, error: message });
      }
    }

    const succeeded = runs.filter((run) => run.ok).length;
    return {
      attempted: runs.length,
      succeeded,
      failed: runs.length - succeeded,
      skipped,
      runs,
    };
  }

  // ─── helpers ────────────────────────────────────────────────────────

  private async assertProductOwned(productId: string, organizationId: string): Promise<void> {
    const product = await findProductForEditor(this.prisma, productId, organizationId);
    if (!product) throw new NotFoundException(`MasterProduct ${productId} not found`);
  }

  private async assertGenerationOwned(id: string, organizationId: string): Promise<void> {
    const existing = await this.prisma.thumbnailGeneration.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException(`ThumbnailGeneration ${id} not found`);
  }
}

// Re-export for backwards-compat with existing GenerationRow consumers (none
// expected — kept narrow for test compatibility).
export type { GenerationRow };
