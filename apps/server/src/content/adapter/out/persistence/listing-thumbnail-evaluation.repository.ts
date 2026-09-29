import { Injectable } from '@nestjs/common';
import { Prisma, type ListingThumbnailEvaluation } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { ListingThumbnailEvaluationView } from '../../../application/port/in/thumbnail/listing-thumbnail-evaluation.port';
import type { ListingThumbnailEvaluationRepositoryPort } from '../../../application/port/out/repository/listing-thumbnail-evaluation.repository.port';
import {
  LISTING_THUMBNAIL_EVALUATION_METHODS,
  LISTING_THUMBNAIL_GRADES,
  type ListingThumbnailEvaluationMethod,
  type ListingThumbnailGrade,
} from '../../../domain/thumbnail/listing-thumbnail-grade';

@Injectable()
export class ListingThumbnailEvaluationRepositoryAdapter implements ListingThumbnailEvaluationRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async find(input: { organizationId: string; channelListingId: string; imageUrl: string }) {
    const row = await this.prisma.listingThumbnailEvaluation.findUnique({
      where: {
        organizationId_channelListingId_imageUrl: {
          organizationId: input.organizationId,
          channelListingId: input.channelListingId,
          imageUrl: input.imageUrl,
        },
      },
    });
    return row ? toView(row) : null;
  }

  async insert(input: Omit<ListingThumbnailEvaluationView, 'id' | 'evaluatedAt'> & { organizationId: string }) {
    try {
      const row = await this.prisma.listingThumbnailEvaluation.create({
        data: {
          organizationId: input.organizationId,
          channelListingId: input.channelListingId,
          imageUrl: input.imageUrl,
          grade: input.grade,
          score: input.score,
          details: input.details as Prisma.InputJsonValue,
          method: input.method,
          modelId: input.modelId,
        },
      });
      return toView(row);
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const winner = await this.find(input);
      if (!winner) throw error;
      return winner;
    }
  }

  async findMany(input: {
    organizationId: string;
    pairs: ReadonlyArray<{ channelListingId: string; imageUrl: string }>;
  }) {
    if (input.pairs.length === 0) return [];
    const rows = await this.prisma.listingThumbnailEvaluation.findMany({
      where: {
        organizationId: input.organizationId,
        OR: input.pairs.map((pair) => ({ channelListingId: pair.channelListingId, imageUrl: pair.imageUrl })),
      },
    });
    return rows.map(toView);
  }
}

function toView(row: ListingThumbnailEvaluation): ListingThumbnailEvaluationView {
  const grade = (LISTING_THUMBNAIL_GRADES as readonly string[]).includes(row.grade) ? row.grade as ListingThumbnailGrade : 'F';
  const method = (LISTING_THUMBNAIL_EVALUATION_METHODS as readonly string[]).includes(row.method)
    ? row.method as ListingThumbnailEvaluationMethod
    : 'vision_model';
  return {
    id: row.id,
    channelListingId: row.channelListingId,
    imageUrl: row.imageUrl,
    grade,
    score: row.score,
    details: row.details && typeof row.details === 'object' && !Array.isArray(row.details)
      ? row.details as Record<string, unknown>
      : {},
    method,
    modelId: row.modelId,
    evaluatedAt: row.evaluatedAt,
  };
}
