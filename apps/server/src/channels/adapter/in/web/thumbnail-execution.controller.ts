import { Controller, Get, Inject, ParseUUIDPipe, Query } from '@nestjs/common';
import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import { ThumbnailExecutionStatusQuerySchema } from '@kiditem/shared/thumbnail-execution';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import {
  CHANNELS_THUMBNAIL_EXECUTION_PORT,
  type ChannelsThumbnailExecutionPort,
} from '../../../application/port/in/thumbnail-execution.port';

/**
 * 대표이미지 몰 반영의 읽기. 반영 자체는 등록 실행(`POST /api/operations` kind `channels.registration`,
 * `executionKind: 'thumbnail_update'`)이고 저장 확인은 `channels/registration-operations/:id/confirm` 이다(KID-364).
 */
@Controller('channels/thumbnail-executions')
export class ThumbnailExecutionController {
  constructor(@Inject(CHANNELS_THUMBNAIL_EXECUTION_PORT) private readonly executions: ChannelsThumbnailExecutionPort) {}

  /** 판매상품에 대표이미지를 받는 listing 이 여럿일 때 운영자가 고를 목록. */
  @Get('listing-choices')
  async listingChoices(
    @CurrentOrganization() organizationId: string,
    @Query('salesProductId', new ParseUUIDPipe()) salesProductId: string,
  ) {
    return { items: await this.executions.listingChoices({ organizationId, salesProductId }) };
  }

  /** 판매 상품마다 가장 최근 대표이미지 반영 실행. */
  @Get()
  async listLatest(@CurrentOrganization() organizationId: string, @Query('salesProductIds') salesProductIds: string | undefined) {
    const parsed = ThumbnailExecutionStatusQuerySchema.safeParse({
      salesProductIds: (salesProductIds ?? '').split(',').map((id) => id.trim()).filter(Boolean),
    });
    if (!parsed.success) throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'REQUEST_INVALID' }, cause: parsed.error });
    return { items: await this.executions.listLatest({ organizationId, salesProductIds: parsed.data.salesProductIds }) };
  }
}
