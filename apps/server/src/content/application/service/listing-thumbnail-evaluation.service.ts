import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { ImageSpec } from '@kiditem/shared/ai';
import type { ListingThumbnailEvaluationSummary } from '@kiditem/shared/product-content';
import type {
  ListingThumbnailEvaluationPort,
  ListingThumbnailEvaluationView,
} from '../port/in/thumbnail/listing-thumbnail-evaluation.port';
import {
  LISTING_THUMBNAIL_EVALUATION_REPOSITORY_PORT,
  type ListingThumbnailEvaluationRepositoryPort,
} from '../port/out/repository/listing-thumbnail-evaluation.repository.port';
import { ThumbnailVisionAiService } from './thumbnail-vision-ai.service';
import { gradeForScore, LISTING_THUMBNAIL_GRADES } from '../../domain/thumbnail/listing-thumbnail-grade';

/**
 * 리스팅 대표이미지 평가(KID-313 W3a). Channels 가 보고한 리스팅 이미지 URL 하나에 평가 한 행이고, 같은 URL 은
 * 다시 평가하지 않는다. 점수는 vision provider 의 5축 품질 평가이고 모델은 호출자가 고른다. 규칙 검사(해상도 ·
 * 비율 · 크기)는 가져온 이미지에서 그때 계산하며 저장하지 않는다.
 */
@Injectable()
export class ListingThumbnailEvaluationService implements ListingThumbnailEvaluationPort {
  constructor(
    @Inject(LISTING_THUMBNAIL_EVALUATION_REPOSITORY_PORT)
    private readonly repository: ListingThumbnailEvaluationRepositoryPort,
    private readonly vision: ThumbnailVisionAiService,
  ) {}

  async evaluate(input: {
    organizationId: string;
    channelListingId: string;
    imageUrl: string;
    modelId: string;
  }): Promise<ListingThumbnailEvaluationView> {
    const modelId = input.modelId?.trim();
    if (!modelId) throw new BadRequestException('modelId is required: choose the vision model explicitly.');
    const imageUrl = input.imageUrl.trim();
    if (!imageUrl) throw new BadRequestException('imageUrl is required.');
    const existing = await this.repository.find({ organizationId: input.organizationId, channelListingId: input.channelListingId, imageUrl });
    if (existing) return existing;

    const results = await this.vision.analyzeQuality(
      [{ contentWorkspaceId: input.channelListingId, productName: '', imageUrl }],
      undefined,
      { model: modelId },
    );
    const quality = results.get(input.channelListingId);
    const score = clampScore(quality?.overallScore ?? 0);
    return this.repository.insert({
      organizationId: input.organizationId,
      channelListingId: input.channelListingId,
      imageUrl,
      grade: gradeForScore(score),
      score,
      details: {
        scores: quality?.scores ?? null,
        issues: quality?.issues ?? [],
        suggestions: quality?.suggestions ?? [],
      },
      method: 'vision_model',
      modelId,
    });
  }

  /** 평가와 함께 이미지 규칙 검사를 돌려준다. 규칙 검사는 저장하지 않는다(이미지를 못 가져오면 null). */
  async evaluateWithImageSpec(input: {
    organizationId: string;
    channelListingId: string;
    imageUrl: string;
    modelId: string;
  }): Promise<{ evaluation: ListingThumbnailEvaluationView; imageSpec: ImageSpec | null }> {
    const evaluation = await this.evaluate(input);
    const imageSpec = await this.vision.checkImageSpec(evaluation.imageUrl).catch(() => null);
    return { evaluation, imageSpec };
  }

  async readCurrent(input: {
    organizationId: string;
    listings: ReadonlyArray<{ channelListingId: string; imageUrl: string | null }>;
  }): Promise<ReadonlyMap<string, ListingThumbnailEvaluationView>> {
    const pairs = input.listings.flatMap((listing) => {
      const imageUrl = listing.imageUrl?.trim();
      return imageUrl ? [{ channelListingId: listing.channelListingId, imageUrl }] : [];
    });
    const rows = await this.repository.findMany({ organizationId: input.organizationId, pairs });
    const wanted = new Map(pairs.map((pair) => [pair.channelListingId, pair.imageUrl]));
    return new Map(rows
      .filter((row) => wanted.get(row.channelListingId) === row.imageUrl)
      .map((row) => [row.channelListingId, row]));
  }

  /** 리스팅들의 현재 이미지 평가와 등급 분포. 이미지가 없는 리스팅은 세지 않는다. */
  async readCurrentWithSummary(input: {
    organizationId: string;
    listings: ReadonlyArray<{ channelListingId: string; imageUrl: string | null }>;
  }): Promise<{ evaluations: ListingThumbnailEvaluationView[]; summary: ListingThumbnailEvaluationSummary }> {
    const current = await this.readCurrent(input);
    const withImage = input.listings.filter((listing) => Boolean(listing.imageUrl?.trim()));
    const evaluations = withImage.flatMap((listing) => {
      const row = current.get(listing.channelListingId);
      return row ? [row] : [];
    });
    const byGrade = Object.fromEntries(LISTING_THUMBNAIL_GRADES.map((grade) => [grade, 0])) as ListingThumbnailEvaluationSummary['byGrade'];
    for (const row of evaluations) byGrade[row.grade] = (byGrade[row.grade] ?? 0) + 1;
    return {
      evaluations,
      summary: { evaluated: evaluations.length, unevaluated: withImage.length - evaluations.length, byGrade },
    };
  }
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}
