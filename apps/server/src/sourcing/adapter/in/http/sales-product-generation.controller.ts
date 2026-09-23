import { Body, Controller, Headers, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { parseRequiredIdempotencyKey } from '../../../../common/http/required-idempotency-key';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { SourcingService } from '../../../application/service/sourcing.service';
import { QuickProcessCandidateDto } from './dto';
import type { AuthUser } from '../../../../auth/auth.types';

/**
 * 판매상품 초안의 콘텐츠 생성 시작.
 *
 * 편집 정본이 초안이므로 생성도 초안을 가리킨다(KID-310 ·
 * [ADR-0022](../../../../../../../docs/adr/0022-sales-product-draft-exists-from-collection.md)).
 * 수집에서 온 초안이든 직접 작성한 초안이든 같은 문을 지난다.
 */
@Controller('products/sales-products')
export class SalesProductGenerationController {
  constructor(private readonly sourcingService: SourcingService) {}

  @Post(':salesProductId/generation')
  async startGeneration(
    @Param('salesProductId', new ParseUUIDPipe()) salesProductId: string,
    @Body() body: QuickProcessCandidateDto | undefined,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.sourcingService.startProductGeneration(
      salesProductId,
      organizationId,
      user.id ?? null,
      body?.task ?? 'all',
      parseRequiredIdempotencyKey(idempotencyKey),
      body?.templateId,
    );
  }
}
