import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { SourcingAssistantService } from '../../../application/service/sourcing-assistant.service';
import { SourcingEntryRecommendationService } from '../../../application/service/sourcing-entry-recommendation.service';
import { AskSourcingAssistantDto, ListEntryRecommendationsQueryDto } from './dto';

/**
 * 초기 진입 추천 표와 그 표를 근거로 답하는 어시스턴트.
 *
 * 키워드를 받지 않는다 — 추천은 이미 수집된 네 소스에서 서버가 직접 만든다.
 *
 * 경로는 반드시 두 세그먼트 이상이어야 한다. `SourcingController` 가 이미
 * `GET /api/sourcing/:id` (후보 상세)를 잡고 있어, 한 세그먼트 경로를 쓰면
 * 후보 ID 로 해석돼 UUID 파싱 오류가 난다.
 */
@Controller('sourcing/entry')
export class SourcingEntryRecommendationController {
  constructor(
    private readonly recommendations: SourcingEntryRecommendationService,
    private readonly assistant: SourcingAssistantService,
  ) {}

  @Get('recommendations')
  async list(
    @Query() query: ListEntryRecommendationsQueryDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.recommendations.getRecommendations({ organizationId, limit: query.limit });
  }

  @Post('assistant-ask')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async ask(@Body() body: AskSourcingAssistantDto, @CurrentOrganization() organizationId: string) {
    return this.assistant.ask({
      organizationId,
      question: body.question,
      visibleContext: body.visibleContext,
    });
  }
}
