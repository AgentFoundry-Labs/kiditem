import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  AppendThumbnailGenerationEventInput,
  ThumbnailGenerationEventPort,
} from '../../../application/port/out/event/thumbnail-generation-event.port';

@Injectable()
export class ThumbnailGenerationEventAdapter implements ThumbnailGenerationEventPort {
  constructor(private readonly prisma: PrismaService) {}

  async append(input: AppendThumbnailGenerationEventInput): Promise<void> {
    await this.prisma.thumbnailGenerationEvent.create({
      data: {
        organizationId: input.organizationId,
        generationId: input.generationId,
        eventType: input.eventType,
        fromStatus: input.fromStatus ?? null,
        toStatus: input.toStatus ?? null,
        fromPhase: input.fromPhase ?? null,
        toPhase: input.toPhase ?? null,
        attemptNumber: input.attemptNumber ?? null,
        errorMessage: input.errorMessage ?? null,
        payload: input.payload == null ? undefined : input.payload as Prisma.InputJsonValue,
        actorUserId: input.actorUserId ?? null,
        occurredAt: input.occurredAt ?? undefined,
      },
    });
  }
}
