import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

/**
 * Tenant-scoped persistence helpers for the Wing registration flow.
 *
 * Every method takes `organizationId` explicitly and applies it to the WHERE/INSERT
 * path. `updateRegistrationAttemptOrThrow` uses `updateMany` + count guard so
 * the write itself is tenant-scoped (not a bare-id `update` that the
 * `check:tenant-scope` scanner would flag).
 *
 * The service that consumes this persistence stays focused on attempt-lifecycle
 * ordering (create → external automation → mark uploaded/failed); none of the
 * Prisma shape leaks back into orchestration.
 */
@Injectable()
export class ThumbnailWingPersistence {
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
    });
  }

  findRegistrableMaster(masterId: string, organizationId: string) {
    return this.prisma.masterProduct.findFirst({
      where: { id: masterId, organizationId, isDeleted: false },
      select: {
        name: true,
        listings: {
          where: { organizationId, channel: 'coupang', isDeleted: false },
          select: { channelName: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
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

  async updateRegistrationAttemptOrThrow(
    id: string,
    organizationId: string,
    data: Prisma.ThumbnailRegistrationAttemptUpdateManyMutationInput,
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
