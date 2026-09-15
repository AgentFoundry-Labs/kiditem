import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import {
  SourcingLiveCommerceSourceAttemptService,
  type BrowserLiveCommerceSourceBatch,
} from '../../../application/service/sourcing-live-commerce-source-attempt.service';
import { parseAttemptToken, toPublicAttempt, toPublicStatus } from './sourcing-source-attempt-http';
import type { AuthUser } from '../../../../auth/auth.types';

const BeginSchema = z.object({ url: z.string() }).strict();

/** Direct owner HTTP seam for browser-collected 1688 and Douyin live pages. */
@Controller('sourcing/live-commerce')
export class SourcingLiveCommerceSourceAttemptController {
  constructor(private readonly sourceAttempts: SourcingLiveCommerceSourceAttemptService) {}

  @Post('browser/attempts')
  beginBrowser(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
  ) {
    const input = parseBegin(body);
    return this.sourceAttempts.beginBrowser({
      organizationId,
      requestedByUserId: user.id,
      idempotencyKey: idempotencyKey ?? '',
      url: input.url,
    });
  }

  @Get('browser/attempts/:attemptId')
  readBrowser(
    @Param('attemptId', new ParseUUIDPipe({ version: '4' })) attemptId: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.sourceAttempts.readBrowser({ organizationId, attemptId }).then(toPublicAttempt);
  }

  @Get('browser/current')
  readBrowserStatus(
    @Query('url') url: string | undefined,
    @CurrentOrganization() organizationId: string,
  ) {
    const input = parseBegin({ url });
    return this.sourceAttempts.readBrowserStatus({ organizationId, url: input.url }).then(toPublicStatus);
  }

  @Put('browser/attempts/:attemptId')
  completeBrowser(
    @Param('attemptId', new ParseUUIDPipe({ version: '4' })) attemptId: string,
    @Headers('x-source-attempt-token') token: string | undefined,
    @Body() batch: BrowserLiveCommerceSourceBatch,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.sourceAttempts.completeBrowser({
      organizationId,
      attemptId,
      attemptToken: parseAttemptToken(token),
      batch,
    }).then(toPublicAttempt);
  }

  @Post('browser/attempts/:attemptId/fail')
  failBrowser(
    @Param('attemptId', new ParseUUIDPipe({ version: '4' })) attemptId: string,
    @Headers('x-source-attempt-token') token: string | undefined,
    @Body() body: { code?: unknown; message?: unknown },
    @CurrentOrganization() organizationId: string,
  ) {
    return this.sourceAttempts.failBrowser({
      organizationId,
      attemptId,
      attemptToken: parseAttemptToken(token),
      code: typeof body?.code === 'string' ? body.code : '',
      message: typeof body?.message === 'string' ? body.message : '',
    }).then(toPublicAttempt);
  }

  @Post('browser/attempts/:attemptId/cancel')
  @HttpCode(200)
  cancelBrowser(
    @Param('attemptId', new ParseUUIDPipe({ version: '4' })) attemptId: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.sourceAttempts.cancelBrowser({ organizationId, attemptId }).then(toPublicAttempt);
  }
}

function parseBegin(value: unknown): z.infer<typeof BeginSchema> {
  const parsed = BeginSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException('INVALID_LIVE_COMMERCE_SOURCE_ATTEMPT_REQUEST');
  return parsed.data;
}
