import { UseFilters } from '@nestjs/common';
import { ChannelBusinessExceptionFilter } from './channel-business-exception.filter';
import { Body, Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import {
  REGISTRATION_EXECUTION_PORT,
  type RegistrationExecutionPort,
} from '../../../application/port/in/capability/registration-execution.port';
import {
  REGISTRATION_STATE_PORT,
  type RegistrationStatePort,
} from '../../../application/port/in/registration-state.port';
import type { SalesProductRegistrationState } from '@kiditem/shared/sales-product';
import {
  ConfirmRegistrationExecutionDto,
  PrepareWingRegistrationExecutionDto,
  PreviewWingRegistrationMatchDto,
  RegistrationExecutionEvidenceDto,
} from './dto/index';
import type { AuthUser } from '../../../../auth/auth.types';

/**
 * 등록 실행 울타리의 HTTP 입구.
 *
 * 수집상품 화면과 몰 마법사가 같은 경로를 쓴다 — 계정에 제출하는 길은 하나다
 * ([ADR-0014](../../../../../../../docs/adr/0014-channels-owns-the-registration-execution-fence.md)).
 * 경로가 판매상품으로 시작하는 것은 울타리가 (판매상품, 계정) 한 쌍을 지키기 때문이다.
 * 수집에서 온 상품이든 직접 작성한 상품이든 같은 문을 지난다
 * ([ADR-0022](../../../../../../../docs/adr/0022-sales-product-draft-exists-from-collection.md)).
 */
@UseFilters(ChannelBusinessExceptionFilter)
@Controller('products/sales-products')
export class ChannelRegistrationExecutionController {
  constructor(
    @Inject(REGISTRATION_EXECUTION_PORT)
    private readonly executions: RegistrationExecutionPort,
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

  @Post(':salesProductId/registration/executions/prepare')
  prepareWingRegistration(
    @Param('salesProductId', new ParseUUIDPipe()) salesProductId: string,
    @Body() body: PrepareWingRegistrationExecutionDto,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.executions.prepareWingRegistration(organizationId, salesProductId, user.id ?? null, body);
  }

  @Post(':salesProductId/registration/executions/match-preview')
  previewWingRegistrationMatch(
    @Param('salesProductId', new ParseUUIDPipe()) salesProductId: string,
    @Body() body: PreviewWingRegistrationMatchDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.executions.previewWingRegistrationMatch(organizationId, salesProductId, body);
  }

  /**
   * 마켓에 이미 등록된 상품을 등록상품으로 확정한다.
   *
   * 쿠팡 WING 은 확장이 화면을 직접 조작해 등록하므로 서버가 provider create 를
   * 부르는 경로를 탈 수 없다. 이 경로는 새 상품을 생성하지 않고, 이미 발급된
   * 등록상품ID 와 확장이 확인한 WING 계정을 대조한 뒤 확정한다. 준비 시 내부
   * 동기화 리스팅을 찾은 경우에는 그 frozen 결과를 재사용한다.
   */
  @Post(':salesProductId/registration/executions/confirm')
  confirmRegistrationExecution(
    @Param('salesProductId', new ParseUUIDPipe()) salesProductId: string,
    @Body() body: ConfirmRegistrationExecutionDto,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.executions.confirmExecution(organizationId, salesProductId, user.id ?? null, body);
  }

  @Post(':salesProductId/registration/executions/:executionId/start')
  startRegistrationExecution(
    @Param('salesProductId', new ParseUUIDPipe()) salesProductId: string,
    @Param('executionId', new ParseUUIDPipe()) executionId: string,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.executions.startExecution(organizationId, salesProductId, user.id ?? null, executionId);
  }

  @Get(':salesProductId/registration/executions/:executionId')
  registrationExecutionStatus(
    @Param('salesProductId', new ParseUUIDPipe()) salesProductId: string,
    @Param('executionId', new ParseUUIDPipe()) executionId: string,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.executions.getExecution(organizationId, salesProductId, user.id ?? null, executionId);
  }

  @Post(':salesProductId/registration/executions/:executionId/unresolved')
  markRegistrationExecutionUnresolved(
    @Param('salesProductId', new ParseUUIDPipe()) salesProductId: string,
    @Param('executionId', new ParseUUIDPipe()) executionId: string,
    @Body() body: RegistrationExecutionEvidenceDto,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.executions.markExecutionUnresolved(
      organizationId, salesProductId, user.id ?? null, executionId, body.evidence,
    );
  }

  /**
   * 확장이 WING 폼을 채우다 실패해 제출 자체가 없었던 실행을 닫는다.
   * `unresolved` 로 두면 실행이 `reconciling` 에 갇혀 재시도·취소가 모두 막힌다.
   */
  @Post(':salesProductId/registration/executions/:executionId/not-submitted')
  markRegistrationExecutionNotSubmitted(
    @Param('salesProductId', new ParseUUIDPipe()) salesProductId: string,
    @Param('executionId', new ParseUUIDPipe()) executionId: string,
    @Body() body: RegistrationExecutionEvidenceDto,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.executions.markExecutionNotSubmitted(
      organizationId, salesProductId, user.id ?? null, executionId, body.evidence,
    );
  }
}
