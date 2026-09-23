import { UseFilters } from '@nestjs/common';
import { ChannelBusinessExceptionFilter } from './channel-business-exception.filter';
import { Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import {
  REGISTRATION_STATE_PORT,
  type RegistrationStatePort,
} from '../../../application/port/in/registration-state.port';
import type { SalesProductRegistrationState } from '@kiditem/shared/sales-product';

/**
 * 판매 상품 하나의 등록 상태 — 몰 계정마다 하나인 등록 대상과 울타리가 말하는 상태.
 *
 * 제출은 이 경로가 아니라 등록 대상 실행(`channels/registration-targets/:id/executions`)이 한다 —
 * 몰마다 다른 전달 방식은 채널 어댑터가 맡는다(KID-321,
 * [ADR-0014](../../../../../../../docs/adr/0014-channels-owns-the-registration-execution-fence.md)).
 */
@UseFilters(ChannelBusinessExceptionFilter)
@Controller('products/sales-products')
export class ChannelRegistrationExecutionController {
  constructor(
    @Inject(REGISTRATION_STATE_PORT)
    private readonly registrations: RegistrationStatePort,
  ) {}

  /** 초안의 등록 설정(몰 계정마다 하나)과 울타리가 말하는 등록 상태. 후보 조회에 기대지 않는다. */
  @Get(':salesProductId/registration/state')
  async registrationState(
    @Param('salesProductId', new ParseUUIDPipe()) salesProductId: string,
    @CurrentOrganization() organizationId: string,
  ): Promise<SalesProductRegistrationState> {
    const view = (await this.registrations.readForSalesProducts(organizationId, [salesProductId])).get(salesProductId);
    if (!view) throw new NotFoundException('판매상품을 찾지 못했습니다.');
    return {
      registrationState: view.registrationState,
      targets: view.preparations.map((row) => ({
        id: row.id,
        channelAccountId: row.channelAccountId,
        channelListingId: row.channelListingId,
        status: row.status as SalesProductRegistrationState['targets'][number]['status'],
        selectedThumbnailAssetId: row.selectedThumbnailAssetId,
        selectedDetailPageRevisionId: row.selectedDetailPageRevisionId,
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  }
}
