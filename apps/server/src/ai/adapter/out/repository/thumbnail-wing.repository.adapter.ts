import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ThumbnailWingRegistrationAttemptPatch,
  ThumbnailWingRepositoryPort,
} from '../../../application/port/out/repository/thumbnail-wing.repository.port';

@Injectable()
export class ThumbnailWingRepositoryAdapter implements ThumbnailWingRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  findGenerationWithCandidates(generationId: string, organizationId: string) {
    return this.prisma.thumbnailGeneration.findFirst({
      where: { id: generationId, organizationId },
      include: {
        candidates: {
          where: { organizationId },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    }).then((generation) =>
      generation
        ? { ...generation, masterId: generation.contentWorkspaceId }
        : null,
    );
  }

  findRegistrableMaster(masterId: string, organizationId: string) {
    return this.prisma.contentWorkspace.findFirst({
      where: {
        id: masterId,
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
    }).then((workspace) =>
      workspace
        ? {
            name: workspace.displayName,
            listings: workspace.channelListing
              ? [{ channelName: workspace.channelListing.channelName }]
              : [],
          }
        : null,
    );
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
