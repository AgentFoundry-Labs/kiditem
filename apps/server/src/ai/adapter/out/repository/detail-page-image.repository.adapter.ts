import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  DETAIL_PAGE_IMAGE_ACTIVE_INTENT_STATES,
  type DetailPageImageArtifactRecord,
  type DetailPageImageIntentClaimResult,
  type DetailPageImageRenderIntentRecord,
  type DetailPageImageRepositoryPort,
} from '../../../application/port/out/repository/detail-page-image.repository.port';

@Injectable()
export class DetailPageImageRepositoryAdapter
  implements DetailPageImageRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async findArtifact(input: {
    organizationId: string;
    revisionId: string;
    variant: string;
    outputWidth: number;
  }): Promise<DetailPageImageArtifactRecord | null> {
    return this.prisma.detailPageImageArtifact.findFirst({ where: input });
  }

  async findActiveIntent(input: {
    organizationId: string;
    sourceCandidateId: string;
    revisionId: string;
    variant: string;
    outputWidth: number;
    now: Date;
  }): Promise<DetailPageImageRenderIntentRecord | null> {
    return this.prisma.detailPageImageRenderIntent.findFirst({
      where: {
        organizationId: input.organizationId,
        sourceCandidateId: input.sourceCandidateId,
        revisionId: input.revisionId,
        variant: input.variant,
        outputWidth: input.outputWidth,
        state: { in: [...DETAIL_PAGE_IMAGE_ACTIVE_INTENT_STATES] },
        expiresAt: { gt: input.now },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createIntent(input: {
    organizationId: string;
    sourceCandidateId: string;
    detailPageArtifactId: string;
    revisionId: string;
    variant: string;
    outputWidth: number;
    objectKey: string;
    requestedByUserId: string;
    expiresAt: Date;
  }): Promise<DetailPageImageRenderIntentRecord> {
    return this.prisma.detailPageImageRenderIntent.create({
      data: {
        ...input,
        state: 'issued',
      },
    });
  }

  async findIntent(input: {
    organizationId: string;
    intentId: string;
  }): Promise<DetailPageImageRenderIntentRecord | null> {
    return this.prisma.detailPageImageRenderIntent.findFirst({
      where: { id: input.intentId, organizationId: input.organizationId },
      include: { completedArtifact: true },
    });
  }

  async claimIntent(input: {
    organizationId: string;
    intentId: string;
    userId: string;
    claimedAt: Date;
  }): Promise<DetailPageImageIntentClaimResult> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.detailPageImageRenderIntent.findFirst({
        where: { id: input.intentId, organizationId: input.organizationId },
      });
      if (!current) return { status: 'missing' };
      if (current.state === 'claimed') {
        return current.claimedByUserId === input.userId
          ? { status: 'claimed', intent: current }
          : { status: 'conflict', intent: current };
      }
      if (current.state !== 'issued') {
        return { status: 'conflict', intent: current };
      }
      const claimed = await tx.detailPageImageRenderIntent.updateMany({
        where: {
          id: input.intentId,
          organizationId: input.organizationId,
          state: 'issued',
        },
        data: {
          state: 'claimed',
          claimedByUserId: input.userId,
          claimedAt: input.claimedAt,
          failureCode: null,
          failureMessage: null,
          failedAt: null,
        },
      });
      if (claimed.count !== 1) {
        const raced = await tx.detailPageImageRenderIntent.findFirst({
          where: { id: input.intentId, organizationId: input.organizationId },
        });
        if (!raced) return { status: 'missing' };
        return raced.state === 'claimed' && raced.claimedByUserId === input.userId
          ? { status: 'claimed', intent: raced }
          : { status: 'conflict', intent: raced };
      }
      const intent = await tx.detailPageImageRenderIntent.findFirstOrThrow({
        where: { id: input.intentId, organizationId: input.organizationId },
      });
      return { status: 'claimed', intent };
    });
  }

  async completeIntent(input: {
    organizationId: string;
    intentId: string;
    imageUrl: string;
    contentType: string;
    byteLength: number;
    pixelWidth: number;
    pixelHeight: number;
    sha256: string;
    rendererKind: string;
    createdByUserId: string;
    completedAt: Date;
  }): Promise<DetailPageImageArtifactRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const intent = await tx.detailPageImageRenderIntent.findFirst({
        where: { id: input.intentId, organizationId: input.organizationId },
        include: { completedArtifact: true },
      });
      if (!intent) return null;
      if (intent.state === 'completed' && intent.completedArtifact) {
        return intent.completedArtifact;
      }
      if (!['claimed', 'uploaded'].includes(intent.state)) return null;

      const artifactData = {
        objectKey: intent.objectKey,
        imageUrl: input.imageUrl,
        contentType: input.contentType,
        byteLength: input.byteLength,
        pixelWidth: input.pixelWidth,
        pixelHeight: input.pixelHeight,
        sha256: input.sha256,
        rendererKind: input.rendererKind,
        createdByUserId: input.createdByUserId,
      } satisfies Prisma.DetailPageImageArtifactUncheckedUpdateInput;
      const artifact = await tx.detailPageImageArtifact.upsert({
        where: {
          organizationId_revisionId_variant_outputWidth: {
            organizationId: input.organizationId,
            revisionId: intent.revisionId,
            variant: intent.variant,
            outputWidth: intent.outputWidth,
          },
        },
        update: artifactData,
        create: {
          organizationId: input.organizationId,
          revisionId: intent.revisionId,
          variant: intent.variant,
          outputWidth: intent.outputWidth,
          ...artifactData,
        },
      });
      await tx.detailPageImageRenderIntent.updateMany({
        where: {
          id: input.intentId,
          organizationId: input.organizationId,
          state: { in: ['claimed', 'uploaded'] },
        },
        data: {
          state: 'completed',
          uploadedAt: intent.uploadedAt ?? input.completedAt,
          completedAt: input.completedAt,
          completedArtifactId: artifact.id,
          failureCode: null,
          failureMessage: null,
          failedAt: null,
        },
      });
      return artifact;
    });
  }

  async failIntent(input: {
    organizationId: string;
    intentId: string;
    failureCode: string;
    failureMessage: string;
    failedAt: Date;
  }): Promise<DetailPageImageRenderIntentRecord | null> {
    await this.prisma.detailPageImageRenderIntent.updateMany({
      where: {
        id: input.intentId,
        organizationId: input.organizationId,
        state: { in: [...DETAIL_PAGE_IMAGE_ACTIVE_INTENT_STATES] },
      },
      data: {
        state: 'failed',
        failedAt: input.failedAt,
        failureCode: input.failureCode,
        failureMessage: input.failureMessage,
      },
    });
    return this.findIntent(input);
  }

  async expireIntent(input: {
    organizationId: string;
    intentId: string;
    expiredAt: Date;
  }): Promise<void> {
    await this.prisma.detailPageImageRenderIntent.updateMany({
      where: {
        id: input.intentId,
        organizationId: input.organizationId,
        state: { in: [...DETAIL_PAGE_IMAGE_ACTIVE_INTENT_STATES] },
        expiresAt: { lte: input.expiredAt },
      },
      data: {
        state: 'expired',
        failedAt: input.expiredAt,
        failureCode: 'intent_expired',
        failureMessage: '상세페이지 이미지 렌더 요청이 만료되었습니다.',
      },
    });
  }
}
