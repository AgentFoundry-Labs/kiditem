import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { ListingThumbnailEvaluation } from '@kiditem/shared/product-content';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import type { ListingThumbnailEvaluationView } from '../../../application/port/in/thumbnail/listing-thumbnail-evaluation.port';
import { ListingThumbnailEvaluationService } from '../../../application/service/listing-thumbnail-evaluation.service';
import {
  EvaluateListingThumbnailDto,
  ReadCurrentListingThumbnailsDto,
} from './dto/listing-thumbnail-evaluation.dto';

/**
 * 몰에 등록된 리스팅 대표이미지 평가(KID-313 W3a). 화면은 리스팅 id 와 몰이 보여 주는 이미지 URL 을 Channels
 * 리스팅 조회에서 읽어 보낸다 — Content 는 리스팅 표를 읽지 않는다.
 */
@Controller('ai/listing-thumbnails')
export class ListingThumbnailEvaluationController {
  constructor(private readonly evaluations: ListingThumbnailEvaluationService) {}

  /** 그 (리스팅, URL) 을 평가한다. 이미 평가했으면 그 평가를 돌려준다. 규칙 검사는 저장하지 않고 함께 준다. */
  @Post(':channelListingId/evaluate')
  async evaluate(
    @CurrentOrganization() organizationId: string,
    @Param('channelListingId', new ParseUUIDPipe()) channelListingId: string,
    @Body() body: EvaluateListingThumbnailDto,
  ) {
    const result = await this.evaluations.evaluateWithImageSpec({
      organizationId,
      channelListingId,
      imageUrl: body.imageUrl,
      modelId: body.modelId,
    });
    return { evaluation: toEvaluation(result.evaluation), imageSpec: result.imageSpec };
  }

  /** 리스팅들의 현재 이미지 평가와 등급 분포. */
  @Post('current')
  async current(
    @CurrentOrganization() organizationId: string,
    @Body() body: ReadCurrentListingThumbnailsDto,
  ) {
    const result = await this.evaluations.readCurrentWithSummary({
      organizationId,
      listings: body.listings.map((listing) => ({
        channelListingId: listing.channelListingId,
        imageUrl: listing.imageUrl ?? null,
      })),
    });
    return { evaluations: result.evaluations.map(toEvaluation), summary: result.summary };
  }
}

function toEvaluation(view: ListingThumbnailEvaluationView): ListingThumbnailEvaluation {
  return { ...view, evaluatedAt: view.evaluatedAt.toISOString() };
}
