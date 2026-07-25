import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import {
  DetailPageCandidateImageService,
  type CandidateDetailImageResult,
} from '../../../application/service/detail-page-candidate-image.service';
import { RenderCandidateDetailImageBodyDto } from './dto';

/**
 * 수집상품(SourcingCandidate)의 저장된 상세페이지 이미지 캐시를 준비하거나 조회한다.
 * 실제 Puppeteer 렌더는 durable worker가 수행하며 이 HTTP 요청에서는 실행하지 않는다.
 *
 * 상세페이지가 없을 때 404 를 주지 않는다. 404 는 호출자가 "그럼 대표이미지로 대신하자"처럼
 * 조용히 폴백하기 쉬워서, 대신 200 + `{ status: 'missing', reason, message }` 로
 * "상세페이지가 없다"는 사실 자체를 명시적으로 돌려준다. 준비 중인 캐시는
 * 200 + `{ status: 'processing' }` 이므로 클라이언트가 짧게 폴링할 수 있다.
 */
@Controller('ai/detail-page-image')
export class DetailPageCandidateImageController {
  constructor(private readonly service: DetailPageCandidateImageService) {}

  @Post('candidate/:candidateId')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  render(
    @Param('candidateId', new ParseUUIDPipe()) candidateId: string,
    @CurrentOrganization() organizationId: string,
    @Body() body: RenderCandidateDetailImageBodyDto,
  ): Promise<CandidateDetailImageResult> {
    return this.service.renderCandidateDetailImage({
      organizationId,
      sourceCandidateId: candidateId,
      outputWidth: body.outputWidth,
      retryFailed: body.retryFailed,
    });
  }
}
