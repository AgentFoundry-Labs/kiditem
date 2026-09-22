import { UseFilters } from '@nestjs/common';
import { ChannelBusinessExceptionFilter } from './channel-business-exception.filter';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import {
  MallAdminListingsBeginSchema,
  MallAdminListingsSubmissionSchema,
} from '@kiditem/shared/mall-admin-listings';
import type { AuthUser } from '../../../../auth/auth.types';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import {
  MALL_ADMIN_LISTINGS_PORT,
  type MallAdminListingsPort,
} from '../../../application/port/in/mall-admin-listings.port';

/** 몰 관리자 화면에서 등록 상품을 직접 가져오는 원천(KID-246 2단계). */
@UseFilters(ChannelBusinessExceptionFilter)
@Controller('channels/mall-admin-listings')
export class MallAdminListingsController {
  constructor(
    @Inject(MALL_ADMIN_LISTINGS_PORT) private readonly listings: MallAdminListingsPort,
  ) {}

  @Post('attempts')
  begin(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: unknown,
  ) {
    const request = MallAdminListingsBeginSchema.safeParse(body ?? {});
    if (!request.success) throw new BadRequestException('MALL_ADMIN_PLAN_INVALID');
    return this.listings.begin({
      organizationId,
      userId: user.id,
      idempotencyKey,
      request: request.data,
    });
  }

  @Get('attempts/:attemptId')
  readAttempt(
    @CurrentOrganization() organizationId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
  ) {
    return this.listings.readAttempt({ organizationId, attemptId });
  }

  @Get('source')
  readSource(@CurrentOrganization() organizationId: string) {
    return this.listings.readSource({ organizationId });
  }

  @Put('attempts/:attemptId')
  complete(
    @CurrentOrganization() organizationId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Headers('x-source-attempt-token') token: string,
    @Body() body: unknown,
  ) {
    const parsed = MallAdminListingsSubmissionSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('MALL_ADMIN_EVIDENCE_INVALID');
    return this.listings.complete({ organizationId, attemptId, token, submission: parsed.data });
  }

  @Post('attempts/:attemptId/fail')
  fail(
    @CurrentOrganization() organizationId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Headers('x-source-attempt-token') token: string,
    @Body() body: { code?: unknown; message?: unknown },
  ) {
    if (
      typeof body?.code !== 'string'
      || typeof body?.message !== 'string'
      || Object.keys(body).some((key) => !['code', 'message'].includes(key))
    ) throw new BadRequestException('MALL_ADMIN_FAILURE_INVALID');
    return this.listings.fail({
      organizationId,
      attemptId,
      token,
      code: body.code,
      message: body.message,
    });
  }

  @Post('attempts/:attemptId/cancel')
  @HttpCode(200)
  cancel(
    @CurrentOrganization() organizationId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
  ) {
    return this.listings.cancel({ organizationId, attemptId });
  }
}
