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
  SabangnetMallListingsBeginSchema,
  SabangnetMallListingsSubmissionSchema,
} from '@kiditem/shared/sabangnet-mall-listings';
import type { AuthUser } from '../../../../auth/auth.types';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import {
  SABANGNET_MALL_LISTINGS_PORT,
  type SabangnetMallListingsPort,
} from '../../../application/port/in/sabangnet-mall-listings.port';

/** 사방넷 송신 기록으로 몰 등록 상품을 가져오는 원천(KID-246). */
@UseFilters(ChannelBusinessExceptionFilter)
@Controller('channels/sabangnet-listings')
export class SabangnetMallListingsController {
  constructor(
    @Inject(SABANGNET_MALL_LISTINGS_PORT) private readonly listings: SabangnetMallListingsPort,
  ) {}

  @Post('attempts')
  begin(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: unknown,
  ) {
    const request = SabangnetMallListingsBeginSchema.safeParse(body ?? {});
    if (!request.success) throw new BadRequestException('SABANGNET_PLAN_INVALID');
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
    const parsed = SabangnetMallListingsSubmissionSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('SABANGNET_EVIDENCE_INVALID');
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
    ) throw new BadRequestException('SABANGNET_FAILURE_INVALID');
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
