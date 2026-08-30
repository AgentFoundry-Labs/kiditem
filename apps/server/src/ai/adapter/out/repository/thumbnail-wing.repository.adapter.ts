import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ThumbnailWingRegistrationAttemptPatch,
  ThumbnailWingRepositoryPort,
} from '../../../application/port/out/repository/thumbnail-wing.repository.port';

@Injectable()
export class ThumbnailWingRepositoryAdapter implements ThumbnailWingRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  findGenerationWithCandidates(generationId: string, organizationId: string) {
    return this.prisma.thumbnailGeneration
      .findFirst({
        where: { id: generationId, organizationId },
        include: {
          candidates: {
            where: { organizationId },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          },
        },
      })
      .then((generation) => (generation ? { ...generation, contentWorkspaceId: generation.contentWorkspaceId } : null));
  }

  findRegistrableWorkspace(contentWorkspaceId: string, organizationId: string) {
    return this.prisma.contentWorkspace.findFirst({
      where: {
        id: contentWorkspaceId,
        organizationId,
        isDeleted: false,
        status: 'active',
        channelListing: {
          is: {
            isActive: true,
            channelAccount: { is: { channel: 'coupang' } },
          },
        },
      },
      select: {
        displayName: true,
        channelListing: { select: { channelName: true } },
      },
    });
  }

  findGenerationWithLatestAttempt(id: string, organizationId: string) {
    return this.prisma.thumbnailGeneration.findFirst({
      where: { id, organizationId },
      include: {
        registrationAttempts: {
          where: { organizationId },
          orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
          take: 1,
        },
      },
    });
  }

  async ensureGenerationExists(id: string, organizationId: string): Promise<void> {
    const existing = await this.prisma.thumbnailGeneration.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException(`ThumbnailGeneration ${id} not found`);
  }

  async createRegistrationAttempt(generationId: string, organizationId: string): Promise<{ id: string }> {
    return this.prisma.thumbnailRegistrationAttempt.create({
      data: {
        organizationId,
        generationId,
        status: 'running',
        startedAt: new Date(),
      },
      select: { id: true },
    });
  }

  async claimAgentRegistrationAttempt(input: {
    generationId: string;
    organizationId: string;
    ownerIdempotencyKey: string;
    requestHash: string;
  }) {
    if (!input.ownerIdempotencyKey.trim() || !/^[a-f0-9]{64}$/.test(input.requestHash)) {
      throw new ConflictException('Wing registration owner receipt is invalid.');
    }
    try {
      const attempt = await this.prisma.thumbnailRegistrationAttempt.create({
        data: {
          organizationId: input.organizationId,
          generationId: input.generationId,
          ownerIdempotencyKey: input.ownerIdempotencyKey,
          requestHash: input.requestHash,
          status: 'running',
          providerOutcome: 'uncertain',
          startedAt: new Date(),
        },
        select: { id: true },
      });
      return { mode: 'create' as const, attemptId: attempt.id };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const existing = await this.prisma.thumbnailRegistrationAttempt.findFirst({
        where: { organizationId: input.organizationId, ownerIdempotencyKey: input.ownerIdempotencyKey },
        select: { id: true, generationId: true, requestHash: true, status: true, providerOutcome: true, screenshotUrl: true },
      });
      if (!existing || existing.generationId !== input.generationId || existing.requestHash !== input.requestHash) {
        throw new ConflictException('Wing registration owner idempotency key conflicted.');
      }
      if (existing.providerOutcome === 'succeeded' && existing.status === 'uploaded') {
        return { mode: 'replay' as const, success: true, screenshotPath: existing.screenshotUrl };
      }
      if (existing.providerOutcome === 'definitive_failure' && existing.status === 'failed') {
        return { mode: 'replay' as const, success: false, screenshotPath: null };
      }
      return { mode: 'reconcile' as const, attemptId: existing.id };
    }
  }

  async finalizeAgentRegistrationAttempt(input: {
    id: string;
    organizationId: string;
    ownerIdempotencyKey: string;
    requestHash: string;
    success: boolean;
    screenshotPath: string | null;
    errorMessage?: string | null;
  }): Promise<void> {
    const updated = await this.prisma.thumbnailRegistrationAttempt.updateMany({
      where: {
        id: input.id, organizationId: input.organizationId,
        ownerIdempotencyKey: input.ownerIdempotencyKey, requestHash: input.requestHash,
        providerOutcome: 'uncertain', status: 'running',
      },
      data: {
        status: input.success ? 'uploaded' : 'failed',
        providerOutcome: input.success ? 'succeeded' : 'definitive_failure',
        screenshotUrl: input.screenshotPath,
        errorMessage: input.errorMessage ?? null,
        resultJson: {
          success: input.success,
          screenshotPath: input.screenshotPath,
          ...(input.success ? {} : { error: input.errorMessage ?? 'Wing upload failed' }),
        } as Prisma.InputJsonValue,
        finishedAt: new Date(),
      },
    });
    if (updated.count !== 1) throw new ConflictException('Wing registration execution changed.');
  }

  async markAgentRegistrationAttemptUncertain(input: {
    id: string;
    organizationId: string;
    ownerIdempotencyKey: string;
    requestHash: string;
    message: string;
  }): Promise<void> {
    const updated = await this.prisma.thumbnailRegistrationAttempt.updateMany({
      where: {
        id: input.id, organizationId: input.organizationId,
        ownerIdempotencyKey: input.ownerIdempotencyKey, requestHash: input.requestHash,
        providerOutcome: 'uncertain', status: 'running',
      },
      data: { status: 'running', errorMessage: input.message.slice(0, 1_000) },
    });
    if (updated.count !== 1) throw new ConflictException('Wing registration execution changed.');
  }

  async updateRegistrationAttemptOrThrow(
    id: string,
    organizationId: string,
    data: ThumbnailWingRegistrationAttemptPatch,
    generationId?: string,
  ): Promise<void> {
    const result = await this.prisma.thumbnailRegistrationAttempt.updateMany({
      where: { id, organizationId, ...(generationId ? { generationId } : {}) },
      data,
    });
    if (result.count === 0) {
      throw new NotFoundException(`ThumbnailRegistrationAttempt ${id} not found`);
    }
  }

  async deleteFailedRegistrationAttempts(generationId: string, organizationId: string): Promise<void> {
    await this.prisma.thumbnailRegistrationAttempt.deleteMany({
      where: { generationId, organizationId, status: 'failed' },
    });
  }
}
