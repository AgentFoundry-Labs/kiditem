import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ComplianceScores,
  EditAnalysisResult,
  RecomposeKind,
  RecomposeVariantKey,
  ThumbnailGenerationItem,
  ThumbnailGenerationListResponse,
  ThumbnailPhase,
} from '@kiditem/shared';
import { RECOMPOSE_KINDS } from '@kiditem/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ThumbnailEditorAiService,
  type ThumbnailEditorCandidate,
  type ThumbnailEditorEditCase,
  type ThumbnailEditorInputImage,
  type ThumbnailInputRole,
} from './thumbnail-editor-ai.service';
import {
  THUMBNAIL_MASTER_IMAGE_SELECT,
  resolveMasterThumbnailImage,
} from './thumbnail-master-image-resolver';
import { getRecomposePromptOverride } from './thumbnail-recompose-prompts';
import { ThumbnailTrackingService } from './thumbnail-tracking.service';

type ThumbnailAnalysisContext = {
  recompose: Prisma.JsonValue | null;
  complianceGrade: string | null;
  complianceScores: Prisma.JsonValue | null;
  overallScore: number;
  grade: string;
  qualityAnalyzedAt: Date | null;
  complianceAnalyzedAt: Date | null;
};

type Candidate = ThumbnailEditorCandidate;
type InputImage = ThumbnailEditorInputImage;

type GenerationRow = {
  id: string;
  createdAt: Date;
  status: string;
  phase: string | null;
  grade: string;
  score: number;
  masterId: string;
  method: string;
  originalUrl: string | null;
  selectedUrl: string | null;
  prompt: string | null;
  editAnalysis: Prisma.JsonValue;
  inputMeta: Prisma.JsonValue;
  errorMessage: string | null;
  attemptCount: number;
  triggeredByUserId: string | null;
  candidates: Array<{
    id: string;
    url: string;
    storageKey: string | null;
    filename: string | null;
    sortOrder: number;
    mimeType: string | null;
    width: number | null;
    height: number | null;
    fileSize: number | null;
  }>;
  registrationAttempts: Array<{
    status: string;
    errorMessage: string | null;
    finishedAt: Date | null;
    updatedAt: Date;
    createdAt: Date;
  }>;
  master: { id: string; name: string; imageUrl: string | null; category: string | null } | null;
};

const ALLOWED_STATUSES = ['pending', 'running', 'succeeded', 'failed', 'cancelled'] as const;
const ALLOWED_PHASES: ThumbnailPhase[] = ['ready', 'applied'];

const GENERATION_INCLUDE: Prisma.ThumbnailGenerationInclude = {
  candidates: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
  registrationAttempts: {
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    take: 1,
  },
  master: { select: { id: true, name: true, imageUrl: true, category: true } },
};

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
    companyId: string,
  ): Promise<{
    id: string;
    name: string;
    imageUrl: string | null;
    category: string | null;
    companyId: string;
  } | null> {
    return this.prisma.masterProduct.findFirst({
      where: { id: productId, companyId, isDeleted: false },
      select: { id: true, name: true, imageUrl: true, category: true, companyId: true },
    });
  }

  async saveEditorResult(input: {
    productId: string;
    companyId: string;
    originalUrl: string | null;
    candidates: Candidate[];
    inputImages?: InputImage[];
    method: string;
    inputMeta?: Prisma.InputJsonValue | null;
    editAnalysis?: EditAnalysisResult | null;
    triggeredByUserId?: string | null;
  }): Promise<string> {
    const generation = await this.prisma.thumbnailGeneration.create({
      data: {
        companyId: input.companyId,
        masterId: input.productId,
        originalUrl: input.originalUrl,
        method: input.method,
        status: 'succeeded',
        phase: 'ready',
        inputMeta: input.inputMeta ?? undefined,
        editAnalysis: input.editAnalysis
          ? (input.editAnalysis as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        triggeredByUserId: input.triggeredByUserId ?? null,
        candidates: {
          create: input.candidates.map((c, index) => ({
            companyId: input.companyId,
            url: c.url,
            storageKey: c.storageKey ?? null,
            filename: c.filename ?? c.storageKey?.split('/').pop() ?? null,
            sortOrder: index,
            mimeType: c.mimeType ?? null,
            width: null,
            height: null,
            fileSize: c.fileSize ?? null,
          })),
        },
        inputImages: input.inputImages?.length
          ? {
              create: input.inputImages.map((img) => ({
                companyId: input.companyId,
                url: img.url,
                storageKey: img.storageKey,
                role: img.role,
                label: img.label,
                sortOrder: img.sortOrder,
                source: img.source,
                mimeType: img.mimeType,
                width: null,
                height: null,
                fileSize: img.fileSize,
              })),
            }
          : undefined,
      },
      select: { id: true },
    });
    return generation.id;
  }

  async findAll(
    companyId: string,
    opts: { productId?: string | null; limit?: number | null } = {},
  ): Promise<ThumbnailGenerationListResponse> {
    const limit = opts.limit ? Math.min(Math.max(opts.limit, 1), 100) : undefined;
    const rows = await this.prisma.thumbnailGeneration.findMany({
      where: {
        companyId,
        ...(opts.productId ? { masterId: opts.productId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      ...(limit ? { take: limit } : {}),
      include: GENERATION_INCLUDE,
    });
    const items = rows.map((r) => this.toItem(r as unknown as GenerationRow));
    return { items, total: items.length } satisfies ThumbnailGenerationListResponse;
  }

  async findOne(id: string, companyId: string): Promise<ThumbnailGenerationItem> {
    const row = await this.prisma.thumbnailGeneration.findFirst({
      where: { id, companyId },
      include: GENERATION_INCLUDE,
    });
    if (!row) throw new NotFoundException(`ThumbnailGeneration ${id} not found`);
    return this.toItem(row as unknown as GenerationRow);
  }

  async selectCandidate(
    id: string,
    companyId: string,
    selectedUrl: string,
  ): Promise<ThumbnailGenerationItem> {
    const existing = await this.prisma.thumbnailGeneration.findFirst({
      where: { id, companyId },
      include: { candidates: true },
    });
    if (!existing) throw new NotFoundException(`ThumbnailGeneration ${id} not found`);
    const isDeselect = !selectedUrl;
    if (!isDeselect && !existing.candidates.some((c) => c.url === selectedUrl)) {
      throw new BadRequestException('selectedUrl 은 해당 generation 의 candidates 중 하나여야 합니다');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.thumbnailGeneration.updateMany({
        where: { id, companyId },
        data: {
          selectedUrl: isDeselect ? null : selectedUrl,
          ...(isDeselect ? {} : { status: 'succeeded', phase: 'ready' }),
        },
      });
    });
    return this.findOne(id, companyId);
  }

  async applyGeneration(id: string, companyId: string): Promise<ThumbnailGenerationItem> {
    const existing = await this.prisma.thumbnailGeneration.findFirst({
      where: { id, companyId },
      include: { candidates: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
    });
    if (!existing) throw new NotFoundException(`ThumbnailGeneration ${id} not found`);

    const selected =
      existing.candidates.find((c) => c.url === existing.selectedUrl) ??
      (existing.selectedUrl
        ? { url: existing.selectedUrl, storageKey: null, filename: null }
        : null);

    await this.prisma.$transaction(async (tx) => {
      if (selected) {
        await tx.masterProduct.updateMany({
          where: { id: existing.masterId, companyId, isDeleted: false },
          data: { imageUrl: selected.url },
        });
        await tx.masterProductImage.updateMany({
          where: { companyId, masterId: existing.masterId, isDeleted: false },
          data: { isPrimary: false },
        });
        await tx.masterProductImage.create({
          data: {
            companyId,
            masterId: existing.masterId,
            url: selected.url,
            storageKey: selected.storageKey,
            role: 'product',
            label: 'AI thumbnail',
            sortOrder: 0,
            source: 'thumbnail_generation',
            mimeType: 'mimeType' in selected ? selected.mimeType : null,
            width: 'width' in selected ? selected.width : null,
            height: 'height' in selected ? selected.height : null,
            fileSize: 'fileSize' in selected ? selected.fileSize : null,
            isPrimary: true,
          },
        });
      }
      await tx.thumbnailGeneration.updateMany({
        where: { id, companyId },
        data: { status: 'succeeded', phase: 'applied', selectedUrl: selected?.url ?? null },
      });
    });

    const analysis = await this.prisma.thumbnailAnalysis.findFirst({
      where: { masterId: existing.masterId, companyId },
      select: { grade: true, overallScore: true },
    });
    void this.trackingService
      .create({
        companyId,
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

    return this.findOne(id, companyId);
  }

  async skipGeneration(id: string, companyId: string): Promise<ThumbnailGenerationItem> {
    const existing = await this.prisma.thumbnailGeneration.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException(`ThumbnailGeneration ${id} not found`);
    await this.prisma.thumbnailGeneration.updateMany({
      where: { id, companyId },
      data: { status: 'cancelled', phase: null },
    });
    return this.findOne(id, companyId);
  }

  async deleteGeneration(id: string, companyId: string): Promise<{ ok: true }> {
    const existing = await this.prisma.thumbnailGeneration.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException(`ThumbnailGeneration ${id} not found`);
    await this.prisma.thumbnailGeneration.deleteMany({ where: { id, companyId } });
    return { ok: true };
  }

  async removeCandidate(
    id: string,
    companyId: string,
    candidateUrl: string,
  ): Promise<{ ok: true; generationDeleted: boolean; remaining: number }> {
    const existing = await this.prisma.thumbnailGeneration.findFirst({
      where: { id, companyId },
      include: { candidates: true },
    });
    if (!existing) throw new NotFoundException(`ThumbnailGeneration ${id} not found`);
    const target = existing.candidates.find((c) => c.url === candidateUrl);
    if (!target) {
      throw new NotFoundException('해당 candidate URL 을 찾을 수 없습니다');
    }
    const remaining = existing.candidates.length - 1;
    await this.prisma.$transaction(async (tx) => {
      await tx.thumbnailGenerationCandidate.deleteMany({ where: { id: target.id, companyId } });
      if (remaining === 0) {
        await tx.thumbnailGeneration.deleteMany({ where: { id, companyId } });
        return;
      }
      if (existing.selectedUrl === candidateUrl) {
        await tx.thumbnailGeneration.updateMany({
          where: { id, companyId },
          data: { selectedUrl: null },
        });
      }
    });
    return { ok: true, generationDeleted: remaining === 0, remaining };
  }

  async createEditJobs(
    productIds: string[],
    companyId: string,
    purpose: 'compliance' | 'quality',
    variantKey: 'auto' | 'with-box' | 'no-box' | null,
    method = 'generate',
  ): Promise<ThumbnailGenerationItem[]> {
    if (productIds.length === 0) return [];
    const products = await this.prisma.masterProduct.findMany({
      where: { id: { in: productIds }, companyId, isDeleted: false },
      select: {
        id: true,
        name: true,
        imageUrl: true,
        thumbnailUrl: true,
        category: true,
        images: THUMBNAIL_MASTER_IMAGE_SELECT,
        thumbnailAnalyses: {
          orderBy: { updatedAt: 'desc' },
          take: 1,
          select: {
            recompose: true,
            complianceGrade: true,
            complianceScores: true,
            overallScore: true,
            grade: true,
            qualityAnalyzedAt: true,
            complianceAnalyzedAt: true,
          },
        },
      },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    const items: ThumbnailGenerationItem[] = [];

    for (const productId of productIds) {
      const product = byId.get(productId);
      if (!product) throw new NotFoundException(`MasterProduct ${productId} not found`);
      const sourceUrl = resolveMasterThumbnailImage(product);
      if (!sourceUrl) throw new BadRequestException('상품 원본 이미지가 필요합니다');

      const analysis: ThumbnailAnalysisContext | null = product.thumbnailAnalyses[0] ?? null;
      const recomposeKind = this.extractRecomposeKind(analysis?.recompose ?? null);
      const editSuggestions = this.extractEditSuggestions(analysis?.complianceScores ?? null);

      const inputImage = await this.editorAiService.resolveInputImage(sourceUrl, companyId, {
        label: 'Product photo',
        role: 'product',
        sortOrder: 0,
        source: 'master_image',
      });
      const promptOverride = getRecomposePromptOverride(
        recomposeKind,
        variantKey,
        product.category,
      );
      const candidates = await this.editorAiService.generateEdit([inputImage], companyId, {
        purpose,
        editCase: 'single',
        userPrompt: promptOverride ? undefined : this.variantInstruction(variantKey),
        productDescription: [product.name, product.category].filter(Boolean).join(' / '),
        productName: product.name,
        category: product.category,
        promptOverride,
        editSuggestions,
      });
      const generationId = await this.saveEditorResult({
        productId: product.id,
        companyId,
        originalUrl: sourceUrl,
        candidates,
        inputImages: [inputImage],
        method,
        inputMeta: {
          mode: 'edit',
          purpose,
          editCase: 'single',
          variantKey: variantKey ?? 'auto',
          automated: method === 'auto',
          inputCount: 1,
          recompose: (analysis?.recompose ?? null) as Prisma.InputJsonValue,
          analysisContext: this.toAnalysisContextJson(analysis, editSuggestions),
        },
        editAnalysis: this.toEditAnalysis(analysis),
      });
      items.push(await this.findOne(generationId, companyId));
    }
    return items;
  }

  async reEditJob(
    id: string,
    companyId: string,
    purpose: 'compliance' | 'quality',
    variantKey: 'auto' | 'with-box' | 'no-box' | null,
  ): Promise<ThumbnailGenerationItem> {
    const existing = await this.prisma.thumbnailGeneration.findFirst({
      where: { id, companyId },
      include: {
        inputImages: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
        candidates: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
        master: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
            thumbnailUrl: true,
            category: true,
            images: THUMBNAIL_MASTER_IMAGE_SELECT,
            thumbnailAnalyses: {
              orderBy: { updatedAt: 'desc' },
              take: 1,
              select: {
                recompose: true,
                complianceGrade: true,
                complianceScores: true,
                overallScore: true,
                grade: true,
                qualityAnalyzedAt: true,
                complianceAnalyzedAt: true,
              },
            },
          },
        },
      },
    });
    if (!existing) throw new NotFoundException(`ThumbnailGeneration ${id} not found`);

    const masterFallback = resolveMasterThumbnailImage(existing.master);
    const seedRows = existing.inputImages.length > 0
      ? existing.inputImages
      : [{
          url: existing.selectedUrl ?? existing.originalUrl ?? masterFallback,
          role: 'product',
          label: 'Product photo',
          sortOrder: 0,
          source: 're-edit',
        }];
    const validSeedRows = seedRows.filter((row) => row.url);
    if (validSeedRows.length === 0) {
      throw new BadRequestException('재편집할 원본 이미지가 없습니다');
    }

    const inputImages: ThumbnailEditorInputImage[] = [];
    for (const row of validSeedRows) {
      inputImages.push(
        await this.editorAiService.resolveInputImage(row.url as string, companyId, {
          label: row.label ?? 'Product photo',
          role: this.toInputRole(row.role),
          sortOrder: row.sortOrder,
          source: row.source ?? 're-edit',
        }),
      );
    }
    const editCase = this.inferEditCaseFromInputs(inputImages);
    const analysis: ThumbnailAnalysisContext | null = existing.master.thumbnailAnalyses[0] ?? null;
    // Prefer recompose carried by the prior generation's inputMeta — re-edits
    // should respect what was decided last time. Fall back to the latest
    // analysis row.
    const recomposeKind =
      this.findRecomposeKindIn(existing.inputMeta) ??
      this.findRecomposeKindIn(existing.editAnalysis) ??
      this.extractRecomposeKind(analysis?.recompose ?? null);
    const editSuggestions = this.extractEditSuggestions(analysis?.complianceScores ?? null);
    const promptOverride = getRecomposePromptOverride(
      recomposeKind,
      variantKey,
      existing.master.category,
    );
    const candidates = await this.editorAiService.generateEdit(inputImages, companyId, {
      purpose,
      editCase,
      userPrompt: promptOverride ? undefined : this.variantInstruction(variantKey),
      productDescription: [existing.master.name, existing.master.category].filter(Boolean).join(' / '),
      productName: existing.master.name,
      category: existing.master.category,
      promptOverride,
      editSuggestions,
    });
    const newGenerationId = await this.saveEditorResult({
      productId: existing.masterId,
      companyId,
      originalUrl: existing.originalUrl ?? masterFallback ?? inputImages[0]?.url ?? null,
      candidates,
      inputImages,
      method: 're-edit',
      inputMeta: {
        mode: 'edit',
        purpose,
        editCase,
        variantKey: variantKey ?? 'auto',
        sourceGenerationId: existing.id,
        inputCount: inputImages.length,
        recompose: (analysis?.recompose ?? existing.inputMeta) as Prisma.InputJsonValue,
        analysisContext: this.toAnalysisContextJson(analysis, editSuggestions),
      },
      editAnalysis: this.toEditAnalysis(analysis),
    });
    return this.findOne(newGenerationId, companyId);
  }

  async createAutoBatch(
    companyId: string,
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
    const products = await this.prisma.masterProduct.findMany({
      where: {
        companyId,
        abcGrade: 'A',
        isDeleted: false,
        OR: [{ imageUrl: { not: null } }, { thumbnailUrl: { not: null } }],
      },
      select: { id: true },
      orderBy: { updatedAt: 'desc' },
      take: take * 3,
    });

    const runs: Array<{ ok: boolean; productId: string; generationId?: string | null; error?: string }> = [];
    let skipped = 0;
    for (const product of products) {
      if (runs.length >= take) break;
      const recent = await this.prisma.thumbnailGeneration.findFirst({
        where: {
          companyId,
          masterId: product.id,
          method: 'auto',
          createdAt: { gte: cooldown },
        },
        select: { id: true },
      });
      if (recent) {
        skipped++;
        continue;
      }
      try {
        const [item] = await this.createEditJobs([product.id], companyId, 'compliance', 'auto', 'auto');
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

  private variantInstruction(variantKey: RecomposeVariantKey | null): string | undefined {
    if (variantKey === 'with-box') {
      return 'Use packaging/box visual context only if it is present in the input; never invent text or claims.';
    }
    if (variantKey === 'no-box') {
      return 'Create a clean product-only hero image without package boxes or extra props.';
    }
    return undefined;
  }

  private extractRecomposeKind(value: Prisma.JsonValue | null): RecomposeKind | null {
    return this.findRecomposeKindIn(value);
  }

  private findRecomposeKindIn(value: Prisma.JsonValue | null | undefined): RecomposeKind | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const object = value as Record<string, unknown>;
    const nested = object.recompose;
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const nestedKind = (nested as Record<string, unknown>).kind;
      if (this.isRecomposeKind(nestedKind)) return nestedKind;
    }
    const directKind = object.kind;
    return this.isRecomposeKind(directKind) ? directKind : null;
  }

  private isRecomposeKind(value: unknown): value is RecomposeKind {
    return typeof value === 'string' && (RECOMPOSE_KINDS as readonly string[]).includes(value);
  }

  private extractEditSuggestions(
    complianceScores: Prisma.JsonValue | null | undefined,
  ): Record<string, string> | null {
    if (!complianceScores || typeof complianceScores !== 'object' || Array.isArray(complianceScores)) {
      return null;
    }
    const obj = complianceScores as Record<string, unknown>;
    const raw = obj.editSuggestions;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === 'string' && value.trim()) {
        out[key] = value.trim();
      }
    }
    return Object.keys(out).length ? out : null;
  }

  /**
   * Build the public `editAnalysis` payload to satisfy
   * `EditAnalysisResultSchema` (non-null grade/score). Returns null when no
   * usable analysis exists.
   */
  private toEditAnalysis(analysis: ThumbnailAnalysisContext | null): EditAnalysisResult | null {
    if (!analysis) return null;
    return {
      complianceGrade: analysis.complianceGrade ?? 'UNKNOWN',
      complianceScores:
        (analysis.complianceScores as Record<string, unknown> | null) ?? null,
      overallScore: analysis.overallScore,
      grade: analysis.grade,
    };
  }

  private toAnalysisContextJson(
    analysis: ThumbnailAnalysisContext | null,
    editSuggestions: Record<string, string> | null,
  ): Prisma.InputJsonValue {
    return {
      complianceGrade: analysis?.complianceGrade ?? null,
      complianceScores: ((analysis?.complianceScores ?? null) as unknown) as Prisma.InputJsonValue,
      overallScore: analysis?.overallScore ?? null,
      grade: analysis?.grade ?? null,
      editSuggestions: editSuggestions ?? null,
    };
  }

  private toInputRole(role: string): ThumbnailInputRole {
    if (role === 'box') return 'box';
    if (role === 'color_variant') return 'color_variant';
    if (role === 'detail' || role === 'size_chart') return 'detail';
    return 'product';
  }

  private inferEditCaseFromInputs(inputs: ThumbnailEditorInputImage[]): ThumbnailEditorEditCase {
    if (inputs.some((img) => img.role === 'color_variant')) return 'color-variants';
    if (inputs.some((img) => img.role === 'box')) return 'compose';
    return inputs.length > 1 ? 'bundle' : 'single';
  }

  private toItem(g: GenerationRow): ThumbnailGenerationItem {
    const status = (ALLOWED_STATUSES as readonly string[]).includes(g.status)
      ? (g.status as ThumbnailGenerationItem['status'])
      : 'failed';
    const phase = g.phase && (ALLOWED_PHASES as readonly string[]).includes(g.phase)
      ? (g.phase as ThumbnailPhase)
      : null;
    return {
      id: g.id,
      createdAt: g.createdAt.toISOString(),
      status,
      phase,
      grade: g.grade,
      score: g.score,
      productId: g.masterId,
      method: g.method,
      originalUrl: g.originalUrl,
      selectedUrl: g.selectedUrl,
      candidates: g.candidates.map((c) => ({
        id: c.id,
        url: c.url,
        storageKey: c.storageKey,
        filename: c.filename ?? c.storageKey?.split('/').pop() ?? c.url.split('/').pop() ?? 'thumbnail',
        sortOrder: c.sortOrder,
      })),
      editAnalysis: (g.editAnalysis as EditAnalysisResult | null) ?? null,
      inputMeta: (g.inputMeta as Record<string, unknown> | null) ?? null,
      errorMessage: g.errorMessage,
      attemptCount: g.attemptCount,
      triggeredByUserId: g.triggeredByUserId ?? null,
      registrationStatus: this.toRegistrationStatus(g.registrationAttempts[0]?.status),
      registrationCheckedAt: this.registrationCheckedAt(g.registrationAttempts[0]),
      registrationError: g.registrationAttempts[0]?.errorMessage ?? null,
      product: {
        id: g.master?.id ?? g.masterId,
        name: g.master?.name ?? '',
        imageUrl: g.master?.imageUrl ?? null,
        coupangProductId: null,
        category: g.master?.category ?? null,
      },
    } satisfies ThumbnailGenerationItem;
  }

  private toRegistrationStatus(status: string | undefined): ThumbnailGenerationItem['registrationStatus'] {
    if (status === 'uploaded' || status === 'registered' || status === 'failed') return status;
    return null;
  }

  private registrationCheckedAt(
    attempt: GenerationRow['registrationAttempts'][number] | undefined,
  ): string | null {
    if (!attempt) return null;
    return (attempt.finishedAt ?? attempt.updatedAt ?? attempt.createdAt).toISOString();
  }
}
