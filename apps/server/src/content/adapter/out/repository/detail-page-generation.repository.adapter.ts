import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { isKiditemError } from '@kiditem/shared/errors';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ownerTransaction, ownerTransactionClient } from '../../../../prisma/owner-transaction';
import {
  AI_DIRECT_JOB_REPOSITORY_PORT,
  type AiDirectJobRepositoryPort,
} from '../../../application/port/out/repository/ai-direct-job.repository.port';
import {
  DETAIL_PAGE_REPOSITORY_PORT,
  type DetailPageRepositoryPort,
} from '../../../application/port/out/repository/detail-page.repository.port';
import type {
  DetailPageContentWorkspaceSnapshot,
  DetailPageDirectGenerationCancellation,
  DetailPageGenerationRepositoryPort,
  DetailPageImageOnlyBaseCandidateSnapshot,
  DetailPageOpenGenerationResult,
} from '../../../application/port/out/repository/detail-page-generation.repository.port';
import { recordDetailPageAssets } from './detail-page-assets';

const DETAIL_PAGE_ACTIVE_STATUSES = ['pending', 'processing'];

@Injectable()
export class DetailPageGenerationRepositoryAdapter implements DetailPageGenerationRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(DETAIL_PAGE_REPOSITORY_PORT)
    private readonly detailPages: DetailPageRepositoryPort,
    @Inject(AI_DIRECT_JOB_REPOSITORY_PORT)
    private readonly directJobs: AiDirectJobRepositoryPort,
  ) {}

  async findActiveContentWorkspace(input: {
    organizationId: string;
    contentWorkspaceId: string;
  }): Promise<DetailPageContentWorkspaceSnapshot | null> {
    return this.prisma.contentWorkspace.findFirst({
      where: {
        id: input.contentWorkspaceId,
        organizationId: input.organizationId,
        status: 'active',
        isDeleted: false,
      },
      select: { id: true, salesProductId: true },
    });
  }

  async openGeneration(
    input: Parameters<DetailPageGenerationRepositoryPort['openGeneration']>[0],
  ): Promise<DetailPageOpenGenerationResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await this.findExistingProductGeneration(tx, input);
        if (existing) return existing;

        const page = await this.detailPages.create(ownerTransaction(tx), {
          id: input.productGenerationIdentity?.generationId,
          organizationId: input.organizationId,
          contentWorkspaceId: input.contentWorkspaceId,
          source: 'generated',
          templateId: input.templateId,
          title: input.title.slice(0, 80),
          status: 'pending',
          generationInput: input.rawInput as unknown as Record<string, unknown>,
          triggeredByUserId: input.triggeredByUserId,
        });
        await recordDetailPageAssets(tx, {
          organizationId: input.organizationId,
          contentWorkspaceId: input.contentWorkspaceId,
          detailPageId: page.id,
          createdByUserId: input.triggeredByUserId,
          role: 'detail_source',
          images: input.imageUrls.map((url) => ({ url })),
        });
        const directJob = await this.directJobs.createInScope(tx, {
          ...input.directJob,
          organizationId: input.organizationId,
          sourceResourceId: page.id,
        });
        return { status: 'created' as const, page, directJobId: directJob.id, releaseRequired: true };
      });
    } catch (error) {
      if (!input.productGenerationIdentity || !isUniqueConstraint(error)) throw error;
      // P2002 는 실패한 트랜잭션을 끝낸다. 먼저 커밋한 결정적 자식을 새 스코프에서 읽어 재요청으로 다룬다.
      const winner = await this.findExistingProductGeneration(this.prisma, input);
      if (winner) return winner;
      throw error;
    }
  }

  private async findExistingProductGeneration(
    scope: Prisma.TransactionClient | PrismaService,
    input: Parameters<DetailPageGenerationRepositoryPort['openGeneration']>[0],
  ): Promise<DetailPageOpenGenerationResult | null> {
    if (!input.productGenerationIdentity) return null;
    const existing = await scope.detailPage.findFirst({
      where: { id: input.productGenerationIdentity.generationId, organizationId: input.organizationId },
      select: { id: true, isDeleted: true, generationInput: true },
    });
    if (!existing) return null;
    if (
      existing.isDeleted ||
      readProductGenerationRequestHash(existing.generationInput) !== input.productGenerationIdentity.requestHash
    ) {
      throw new ConflictException('product_generation_idempotency_conflict');
    }
    const page = await this.detailPages.findById({ organizationId: input.organizationId, detailPageId: existing.id });
    const directJob = await scope.aiDirectJob.findFirst({
      where: { organizationId: input.organizationId, jobType: 'detail_page_generate', sourceResourceId: existing.id },
      select: { id: true, status: true },
    });
    if (!page || !directJob) throw new Error(`Missing detail-page AI direct job for ${existing.id}.`);
    return { status: 'existing', page, directJobId: directJob.id, releaseRequired: directJob.status === 'held' };
  }

  async findImageOnlyBaseCandidates(input: {
    organizationId: string;
    contentWorkspaceId: string;
    templateId: string;
  }): Promise<DetailPageImageOnlyBaseCandidateSnapshot[]> {
    return this.prisma.detailPage.findMany({
      where: {
        organizationId: input.organizationId,
        contentWorkspaceId: input.contentWorkspaceId,
        source: 'generated',
        templateId: input.templateId,
        status: 'ready',
        isDeleted: false,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, generationInput: true, generationResult: true, templateId: true },
    });
  }

  findSourceDetailPage(input: { organizationId: string; detailPageId: string }) {
    return this.prisma.detailPage.findFirst({
      where: { id: input.detailPageId, organizationId: input.organizationId, isDeleted: false },
      select: { id: true, title: true },
    });
  }

  findSourceContentAsset(input: { organizationId: string; contentAssetId: string }) {
    return this.prisma.contentAsset.findFirst({
      where: { id: input.contentAssetId, organizationId: input.organizationId, isDeleted: false },
      select: { id: true, label: true, role: true },
    });
  }

  findGenerationStatus(input: { organizationId: string; detailPageId: string }) {
    return this.prisma.detailPage.findFirst({
      where: { id: input.detailPageId, organizationId: input.organizationId, source: 'generated' },
      select: { id: true, status: true },
    });
  }

  async cancelDirectGeneration(input: {
    organizationId: string;
    detailPageId: string;
    reason: string;
  }): Promise<DetailPageDirectGenerationCancellation> {
    const current = await this.findGenerationStatus(input);
    if (!current) return { status: 'not_found', generationId: input.detailPageId, preserved: false };
    if (!DETAIL_PAGE_ACTIVE_STATUSES.includes(current.status)) {
      return { status: 'already_terminal', generationId: current.id, preserved: current.status === 'ready' };
    }
    return this.detailPages.runInTransaction(async (transaction) => {
      try {
        await this.detailPages.setStatus(transaction, {
          organizationId: input.organizationId,
          detailPageId: current.id,
          status: 'failed',
          errorMessage: input.reason,
        });
      } catch (error) {
        if (!(isKiditemError(error) && error.code === 'STATE_CONFLICT')) throw error;
        // 결과가 먼저 들어왔다 — 끝난 생성은 그대로 둔다.
        return { status: 'already_terminal' as const, generationId: current.id, preserved: true };
      }
      await ownerTransactionClient(transaction).aiDirectJob.updateMany({
        where: {
          organizationId: input.organizationId,
          sourceResourceId: current.id,
          jobType: 'detail_page_generate',
          status: { in: ['held', 'pending', 'running', 'projecting'] },
        },
        data: {
          status: 'cancelled',
          finishedAt: new Date(),
          leaseExpiresAt: null,
          lastErrorCode: 'user_cancelled',
          lastErrorMessage: input.reason,
        },
      });
      return { status: 'cancelled' as const, generationId: current.id, preserved: false };
    });
  }
}

function readProductGenerationRequestHash(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const requestHash = (value as Record<string, unknown>).productGenerationRequestHash;
  return typeof requestHash === 'string' ? requestHash : null;
}

function isUniqueConstraint(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: unknown }).code === 'P2002');
}
