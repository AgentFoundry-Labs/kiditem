import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  EditAnalysisResult,
  ThumbnailGenerationItem,
  ThumbnailGenerationListResponse,
  ThumbnailPhase,
} from '@kiditem/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ThumbnailTrackingService } from './thumbnail-tracking.service';

type Candidate = { url: string; filename: string };

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
  candidates: Prisma.JsonValue;
  prompt: string | null;
  editAnalysis: Prisma.JsonValue;
  triggeredByUserId: string | null;
  master: { id: string; name: string; imageUrl: string | null } | null;
};

const ALLOWED_STATUSES = ['pending', 'running', 'succeeded', 'failed', 'cancelled'] as const;
const ALLOWED_PHASES: ThumbnailPhase[] = ['ready', 'applied'];

@Injectable()
export class ThumbnailGenerationService {
  private readonly logger = new Logger(ThumbnailGenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly trackingService: ThumbnailTrackingService,
  ) {}

  async findAll(companyId: string): Promise<ThumbnailGenerationListResponse> {
    const rows = await this.prisma.thumbnailGeneration.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      include: { master: { select: { id: true, name: true, imageUrl: true } } },
    });
    const items = rows.map((r) => this.toItem(r as unknown as GenerationRow));
    return { items, total: items.length } satisfies ThumbnailGenerationListResponse;
  }

  async findOne(id: string, companyId: string): Promise<ThumbnailGenerationItem> {
    const row = await this.prisma.thumbnailGeneration.findFirst({
      where: { id, companyId },
      include: { master: { select: { id: true, name: true, imageUrl: true } } },
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
      select: { id: true, candidates: true },
    });
    if (!existing) throw new NotFoundException(`ThumbnailGeneration ${id} not found`);
    const candidates = (existing.candidates as unknown as Candidate[]) ?? [];
    const isDeselect = !selectedUrl;
    if (!isDeselect && !candidates.some((c) => c.url === selectedUrl)) {
      throw new BadRequestException('selectedUrl 은 해당 generation 의 candidates 중 하나여야 합니다');
    }
    const updated = await this.prisma.thumbnailGeneration.update({
      where: { id },
      data: {
        selectedUrl: isDeselect ? null : selectedUrl,
        ...(isDeselect ? {} : { status: 'succeeded', phase: 'ready' }),
      },
      include: { master: { select: { id: true, name: true, imageUrl: true } } },
    });
    return this.toItem(updated as unknown as GenerationRow);
  }

  async applyGeneration(id: string, companyId: string): Promise<ThumbnailGenerationItem> {
    const existing = await this.prisma.thumbnailGeneration.findFirst({
      where: { id, companyId },
    });
    if (!existing) throw new NotFoundException(`ThumbnailGeneration ${id} not found`);

    if (existing.selectedUrl) {
      await this.prisma.masterProduct.updateMany({
        where: { id: existing.masterId, companyId, isDeleted: false },
        data: { imageUrl: existing.selectedUrl },
      });
    }

    const updated = await this.prisma.thumbnailGeneration.update({
      where: { id },
      data: { status: 'succeeded', phase: 'applied' },
      include: { master: { select: { id: true, name: true, imageUrl: true } } },
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

    return this.toItem(updated as unknown as GenerationRow);
  }

  async skipGeneration(id: string, companyId: string): Promise<ThumbnailGenerationItem> {
    const existing = await this.prisma.thumbnailGeneration.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException(`ThumbnailGeneration ${id} not found`);
    const updated = await this.prisma.thumbnailGeneration.update({
      where: { id },
      data: { status: 'cancelled', phase: null },
      include: { master: { select: { id: true, name: true, imageUrl: true } } },
    });
    return this.toItem(updated as unknown as GenerationRow);
  }

  async deleteGeneration(id: string, companyId: string): Promise<{ ok: true }> {
    const existing = await this.prisma.thumbnailGeneration.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException(`ThumbnailGeneration ${id} not found`);
    await this.prisma.thumbnailGeneration.delete({ where: { id } });
    return { ok: true };
  }

  async removeCandidate(
    id: string,
    companyId: string,
    candidateUrl: string,
  ): Promise<{ ok: true; generationDeleted: boolean; remaining: number }> {
    const existing = await this.prisma.thumbnailGeneration.findFirst({
      where: { id, companyId },
      select: { id: true, candidates: true, selectedUrl: true },
    });
    if (!existing) throw new NotFoundException(`ThumbnailGeneration ${id} not found`);
    const candidates = (existing.candidates as unknown as Candidate[]) ?? [];
    const next = candidates.filter((c) => c.url !== candidateUrl);
    if (next.length === candidates.length) {
      throw new NotFoundException('해당 candidate URL 을 찾을 수 없습니다');
    }
    if (next.length === 0) {
      await this.prisma.thumbnailGeneration.delete({ where: { id } });
      return { ok: true, generationDeleted: true, remaining: 0 };
    }
    const shouldClearSelected = existing.selectedUrl === candidateUrl;
    await this.prisma.thumbnailGeneration.update({
      where: { id },
      data: {
        candidates: next as unknown as Prisma.InputJsonValue,
        ...(shouldClearSelected ? { selectedUrl: null } : {}),
      },
    });
    return { ok: true, generationDeleted: false, remaining: next.length };
  }

  /**
   * 현재 main 은 ai 도메인에서 image_edit agent 와 thumbnail generation row 를 잇는
   * bridge 가 구현되어 있지 않다. 가짜 candidate 를 만들어 주지 말고 truthful unavailable
   * 로 응답한다 (R4 plan: agent-backed generation/edit 미연결 케이스).
   */
  createEditJobs(
    _productIds: string[],
    _companyId: string,
    _purpose: 'compliance' | 'quality',
    _variantKey: 'auto' | 'with-box' | 'no-box' | null,
  ): never {
    throw new ServiceUnavailableException('thumbnail_edit_agent_not_connected');
  }

  reEditJob(
    _id: string,
    _companyId: string,
    _purpose: 'compliance' | 'quality',
    _variantKey: 'auto' | 'with-box' | 'no-box' | null,
  ): never {
    throw new ServiceUnavailableException('thumbnail_edit_agent_not_connected');
  }

  // ─── helpers ────────────────────────────────────────────────────────

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
      candidates: ((g.candidates as unknown as Candidate[]) ?? []).map((c) => ({
        url: c.url,
        filename: c.filename,
      })),
      editAnalysis: (g.editAnalysis as EditAnalysisResult | null) ?? null,
      triggeredByUserId: g.triggeredByUserId ?? null,
      registrationStatus: null,
      registrationCheckedAt: null,
      registrationError: null,
      product: {
        id: g.master?.id ?? g.masterId,
        name: g.master?.name ?? '',
        imageUrl: g.master?.imageUrl ?? null,
        coupangProductId: null,
        category: null,
      },
    } satisfies ThumbnailGenerationItem;
  }
}
