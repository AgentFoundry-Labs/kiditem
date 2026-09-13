import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  RocketPoSourceBeginSchema,
  RocketPoSourceSubmissionSchema,
} from '@kiditem/shared/rocket-purchase-preview';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import {
  ROCKET_PO_CATALOG_PORT,
  type RocketPoCatalogPort,
} from '../../../application/port/in/rocket-po-catalog.port';

@Controller('channels/rocket-po')
export class RocketPoSourceController {
  constructor(@Inject(ROCKET_PO_CATALOG_PORT) private readonly catalog: RocketPoCatalogPort) {}
  @Post('attempts')
  begin(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: unknown,
  ) {
    const request = RocketPoSourceBeginSchema.safeParse(body);
    if (!request.success) throw new BadRequestException('ROCKET_PO_PLAN_INVALID');
    return this.catalog.begin({
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
    return this.catalog.readAttempt({ organizationId, attemptId });
  }
  @Get('source')
  readSource(
    @CurrentOrganization() organizationId: string,
    @Query('channelAccountId', ParseUUIDPipe) channelAccountId: string,
  ) {
    return this.catalog.readSource({ organizationId, channelAccountId });
  }
  @Put('attempts/:attemptId')
  complete(
    @CurrentOrganization() organizationId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Headers('x-source-attempt-token') token: string,
    @Body() body: unknown,
  ) {
    const parsed = RocketPoSourceSubmissionSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('ROCKET_PO_EVIDENCE_INVALID');
    return this.catalog.complete({ organizationId, attemptId, token, submission: parsed.data });
  }
  @Post('attempts/:attemptId/fail')
  fail(
    @CurrentOrganization() organizationId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Headers('x-source-attempt-token') token: string,
    @Body() body: { code?: unknown; message?: unknown },
  ) {
    if (
      typeof body?.code !== 'string' ||
      typeof body?.message !== 'string' ||
      Object.keys(body).some((key) => !['code', 'message'].includes(key))
    )
      throw new BadRequestException('ROCKET_PO_FAILURE_INVALID');
    return this.catalog.fail({
      organizationId,
      attemptId,
      token,
      code: body.code,
      message: body.message,
    });
  }
}
