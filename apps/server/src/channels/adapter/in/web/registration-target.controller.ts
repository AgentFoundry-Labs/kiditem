import { Body, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import { RegistrationTargetResolveInputSchema, RegistrationTargetUpdateInputSchema } from '@kiditem/shared/sales-product';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { REGISTRATION_TARGET_PORT, type RegistrationTargetPort } from '../../../application/port/in/registration-target.port';
import { RegistrationMallInputError, normalizeRegistrationMallInput } from '../../../domain/registration/registration-mall-input';

@Controller('channels/registration-targets')
export class RegistrationTargetController {
  constructor(@Inject(REGISTRATION_TARGET_PORT) private readonly targets: RegistrationTargetPort) {}

  @Get()
  list(@CurrentOrganization() organizationId: string, @Query('salesProductId', new ParseUUIDPipe()) salesProductId: string) {
    return this.targets.list(organizationId, salesProductId);
  }
  @Get(':id')
  get(@CurrentOrganization() organizationId: string, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.targets.get(organizationId, id);
  }
  /** 등록 설정이 생기는 유일한 길 — 찾거나 만들고, 처음 만들 때 KID 를 발급한다(KID-313). */
  @Post('resolve')
  resolve(@CurrentOrganization() organizationId: string, @Body() body: unknown) {
    const parsed = RegistrationTargetResolveInputSchema.safeParse(body);
    if (!parsed.success) throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'REQUEST_INVALID' }, cause: parsed.error });
    return this.targets.resolve(organizationId, parsed.data);
  }
  @Put(':id')
  update(@CurrentOrganization() organizationId: string, @Param('id', new ParseUUIDPipe()) id: string, @Body() body: unknown) {
    const parsed = RegistrationTargetUpdateInputSchema.safeParse(body);
    if (!parsed.success) {
      const refusal = productFactRefusal(body);
      if (refusal) {
        throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'PRODUCT_FACT_KEYS', keys: refusal.keys }, message: refusal.message });
      }
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'REQUEST_INVALID' }, cause: parsed.error });
    }
    return this.targets.update(organizationId, id, parsed.data);
  }
  /** 이 몰에 더 보내지 않는다. 살아 있는 제출이 있으면 거절한다. */
  @Delete(':id')
  archive(@CurrentOrganization() organizationId: string, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.targets.archive(organizationId, id);
  }
}


/**
 * 등록 설정에 상품 사실(이름 · 가격 · 상세 …)을 보내면 스키마가 거절하기 전에 어느 키인지 말한다(KID-313 W2).
 * 그 값은 판매 상품 · 옵션 · 상세 페이지에서 고친다.
 */
function productFactRefusal(body: unknown): { message: string; keys: readonly string[] } | null {
  const input = body && typeof body === 'object' ? (body as { registrationInput?: unknown }).registrationInput : undefined;
  try {
    normalizeRegistrationMallInput(input);
    return null;
  } catch (error) {
    if (error instanceof RegistrationMallInputError) return { message: error.message, keys: error.productFactKeys };
    return null;
  }
}
