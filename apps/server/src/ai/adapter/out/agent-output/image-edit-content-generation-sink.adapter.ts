import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ContentAssetService } from '../../../application/service/content-asset.service';
import type { ImageEditAgentOutputSinkPort } from '../../../application/port/out/image-edit-agent-output-sink.port';
import type { ImageEditAgentOutput } from '../../../domain/agent-output';

const TERMINAL_CONTENT_GENERATION_STATUSES = new Set([
  'READY',
  'FAILED',
  'CANCELLED',
  'completed',
  'failed',
  'cancelled',
]);

@Injectable()
export class ImageEditContentGenerationSinkAdapter
  implements ImageEditAgentOutputSinkPort
{
  private readonly logger = new Logger(ImageEditContentGenerationSinkAdapter.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contentAssets: ContentAssetService,
  ) {}

  async applySuccess(input: {
    organizationId: string;
    requestId: string;
    runId: string | undefined;
    sourceResourceId: string | null;
    output: ImageEditAgentOutput;
  }): Promise<void> {
    if (!input.sourceResourceId) {
      this.logger.debug(
        `image_edit success without sourceResourceId (request=${input.requestId}); no content archive row to apply.`,
      );
      return;
    }

    const row = await this.prisma.contentGeneration.findFirst({
      where: {
        id: input.sourceResourceId,
        organizationId: input.organizationId,
        contentType: 'image',
      },
      select: { id: true, masterId: true, status: true },
    });
    if (!row) {
      this.logger.warn(
        `image_edit success: ContentGeneration ${input.sourceResourceId} not found in organization ${input.organizationId}.`,
      );
      return;
    }
    if (TERMINAL_CONTENT_GENERATION_STATUSES.has(row.status)) {
      this.logger.debug(
        `image_edit success: ContentGeneration ${row.id} already terminal (${row.status}); no-op.`,
      );
      return;
    }

    await this.contentAssets.recordImageEditOutputAsset({
      organizationId: input.organizationId,
      contentGenerationId: row.id,
      masterId: row.masterId,
      imageUrl: input.output.image_url,
    });

    const processedImages = { edited: input.output.image_url };
    const updated = await this.prisma.contentGeneration.updateMany({
      where: {
        id: row.id,
        organizationId: input.organizationId,
        status: { notIn: [...TERMINAL_CONTENT_GENERATION_STATUSES] },
      },
      data: {
        processedImages: processedImages as Prisma.InputJsonValue,
        status: 'READY',
        errorMessage: null,
      },
    });
    if (updated.count === 0) {
      this.logger.debug(
        `image_edit success: ContentGeneration ${row.id} became terminal before apply; no-op.`,
      );
      return;
    }

    this.logger.log(
      `image_edit applied success -> ContentGeneration ${row.id} READY (request=${input.requestId}).`,
    );
  }

  async applyFailure(input: {
    organizationId: string;
    requestId: string;
    runId: string | undefined;
    sourceResourceId: string | null;
    errorCode: string;
    errorMessage: string;
  }): Promise<void> {
    if (!input.sourceResourceId) {
      this.logger.debug(
        `image_edit failure without sourceResourceId (request=${input.requestId}); no content archive row to apply.`,
      );
      return;
    }

    const row = await this.prisma.contentGeneration.findFirst({
      where: {
        id: input.sourceResourceId,
        organizationId: input.organizationId,
        contentType: 'image',
      },
      select: { id: true, status: true },
    });
    if (!row) {
      this.logger.warn(
        `image_edit failure: ContentGeneration ${input.sourceResourceId} not found in organization ${input.organizationId}.`,
      );
      return;
    }
    if (TERMINAL_CONTENT_GENERATION_STATUSES.has(row.status)) {
      this.logger.debug(
        `image_edit failure: ContentGeneration ${row.id} already terminal (${row.status}); no-op.`,
      );
      return;
    }

    await this.prisma.contentGeneration.updateMany({
      where: {
        id: row.id,
        organizationId: input.organizationId,
        status: { notIn: [...TERMINAL_CONTENT_GENERATION_STATUSES] },
      },
      data: {
        status: 'FAILED',
        errorMessage: input.errorMessage,
      },
    });

    this.logger.log(
      `image_edit applied failure -> ContentGeneration ${row.id} FAILED (code=${input.errorCode} request=${input.requestId}).`,
    );
  }
}
