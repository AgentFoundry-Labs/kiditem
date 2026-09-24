import { Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import {
  REGISTRATION_STATE_PORT,
  type RegistrationStatePort,
} from '../../../application/port/in/registration-state.port';
import type { SalesProductRegistrationState } from '@kiditem/shared/sales-product';

/**
 * 판매 상품 하나의 몰 계정별 등록 상태 — 등록 상태 reader 하나가 판정한다(KID-313 결정 11, KID-320).
 *
 * 제출은 이 경로가 아니라 등록 대상 실행(`channels/registration-targets/:id/executions`)이 한다 —
 * 몰마다 다른 전달 방식은 채널 어댑터가 맡는다(KID-321,
 * [ADR-0014](../../../../../../../docs/adr/0014-channels-owns-the-registration-execution-fence.md)).
 */
@Controller('products/sales-products')
export class ChannelRegistrationExecutionController {
  constructor(
    @Inject(REGISTRATION_STATE_PORT)
    private readonly registrations: RegistrationStatePort,
  ) {}

  /** 등록 설정이나 리스팅이 있는 계정마다 한 줄. 없는 상품 · 다른 조직의 상품은 404. */
  @Get(':salesProductId/registration/state')
  async registrationState(
    @Param('salesProductId', new ParseUUIDPipe()) salesProductId: string,
    @CurrentOrganization() organizationId: string,
  ): Promise<SalesProductRegistrationState> {
    const view = (await this.registrations.readForSalesProducts(organizationId, [salesProductId])).get(salesProductId);
    if (!view) throw new NotFoundException('판매상품을 찾지 못했습니다.');
    return { accounts: view.accounts };
  }
}
