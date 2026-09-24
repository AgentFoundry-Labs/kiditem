import { UseFilters } from '@nestjs/common';
import { ChannelBusinessExceptionFilter } from './channel-business-exception.filter';
import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { RegistrationTargetResolveInputSchema, RegistrationTargetUpdateInputSchema } from '@kiditem/shared/sales-product';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { REGISTRATION_TARGET_PORT, type RegistrationTargetPort } from '../../../application/port/in/registration-target.port';
import { RegistrationTargetException } from '../../../application/exception/registration-target.exception';
import { RegistrationMallInputError, normalizeRegistrationMallInput } from '../../../domain/registration/registration-mall-input';

@UseFilters(ChannelBusinessExceptionFilter)
@Controller('channels/registration-targets')
export class RegistrationTargetController {
  constructor(@Inject(REGISTRATION_TARGET_PORT) private readonly targets: RegistrationTargetPort) {}

  @Get()
  list(@CurrentOrganization() organizationId: string, @Query('salesProductId', new ParseUUIDPipe()) salesProductId: string) {
    return translate(() => this.targets.list(organizationId, salesProductId));
  }
  @Get(':id')
  get(@CurrentOrganization() organizationId: string, @Param('id', new ParseUUIDPipe()) id: string) {
    return translate(() => this.targets.get(organizationId, id));
  }
  /** 등록 설정이 생기는 유일한 길 — 찾거나 만들고, 처음 만들 때 KID 를 발급한다(KID-313). */
  @Post('resolve')
  resolve(@CurrentOrganization() organizationId: string, @Body() body: unknown) {
    const parsed = RegistrationTargetResolveInputSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return translate(() => this.targets.resolve(organizationId, parsed.data));
  }
  @Put(':id')
  update(@CurrentOrganization() organizationId: string, @Param('id', new ParseUUIDPipe()) id: string, @Body() body: unknown) {
    const parsed = RegistrationTargetUpdateInputSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(productFactRefusal(body) ?? parsed.error.flatten());
    return translate(() => this.targets.update(organizationId, id, parsed.data));
  }
  /** 이 몰에 더 보내지 않는다. 살아 있는 제출이 있으면 거절한다. */
  @Delete(':id')
  archive(@CurrentOrganization() organizationId: string, @Param('id', new ParseUUIDPipe()) id: string) {
    return translate(() => this.targets.archive(organizationId, id));
  }
}

async function translate<T>(run: () => Promise<T>): Promise<T> {
  try { return await run(); }
  catch (error) {
    if (!(error instanceof RegistrationTargetException)) throw error;
    if (error.code === 'not_found') throw new NotFoundException(error.message);
    if (error.code === 'conflict') throw new ConflictException(error.message);
    throw new BadRequestException(error.message);
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
