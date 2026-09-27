import { Body, Controller, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import { RegistrationCloseRequestSchema, RegistrationConfirmRequestSchema } from '@kiditem/shared/channels-operations';
import type { OperationFinishResponse } from '@kiditem/shared/operation';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import {
  REGISTRATION_OPERATION_PORT,
  type RegistrationOperationPort,
} from '../../../application/port/in/registration-operation.port';

/**
 * `reconciling` 등록 실행(몰에 제출했지만 결과를 못 읽음)을 운영자가 몰에서 본 사실로 닫는다(KID-364 · KID-218).
 * 시작 · 진행 · 읽기는 실행 계약(`/api/operations`)이다. 권한: 같은 조직 운영자 누구나(리더 가정 = KID-329 (a), 사장님 확인 대기).
 */
@Controller('channels/registration-operations')
export class RegistrationOperationController {
  constructor(@Inject(REGISTRATION_OPERATION_PORT) private readonly registrations: RegistrationOperationPort) {}

  /** 몰에서 읽은 등록상품ID로 확인 → `succeeded`, 리스팅 · 옵션 연결. */
  @Post(':id/confirm')
  async confirm(
    @CurrentOrganization() organizationId: string,
    @Param('id', new ParseUUIDPipe()) operationId: string,
    @Body() body: unknown,
  ): Promise<OperationFinishResponse> {
    const parsed = RegistrationConfirmRequestSchema.safeParse(body);
    if (!parsed.success) throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'REQUEST_INVALID' }, cause: parsed.error });
    return { operation: await this.registrations.confirm(organizationId, operationId, parsed.data) };
  }

  /** 몰에 등록되지 않았다 → `failed`(`CHANNELS_REGISTRATION_NOT_FOUND_ON_MALL`). */
  @Post(':id/close')
  async close(
    @CurrentOrganization() organizationId: string,
    @Param('id', new ParseUUIDPipe()) operationId: string,
    @Body() body: unknown,
  ): Promise<OperationFinishResponse> {
    const parsed = RegistrationCloseRequestSchema.safeParse(body);
    if (!parsed.success) throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'REQUEST_INVALID' }, cause: parsed.error });
    return { operation: await this.registrations.close(organizationId, operationId, parsed.data) };
  }
}
