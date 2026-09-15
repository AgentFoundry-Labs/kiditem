import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import {
  SourcingBrowserSourceAttemptService,
  type Browser1688SourceBatch,
} from '../../../application/service/sourcing-browser-source-attempt.service';
import { parseAttemptToken, toPublicAttempt, toPublicStatus } from './sourcing-source-attempt-http';
import type { AuthUser } from '../../../../auth/auth.types';


/** Direct owner HTTP seam for browser-collected Sourcing facts. */
@Controller('sourcing')
export class SourcingBrowserSourceAttemptController {
  constructor(private readonly sourceAttempts: SourcingBrowserSourceAttemptService) {}

  @Post('1688-trends/attempts')
  begin1688(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.sourceAttempts.begin1688({
      organizationId,
      requestedByUserId: user.id,
      idempotencyKey: idempotencyKey ?? '',
    });
  }

  @Get('1688-trends/attempts/:attemptId')
  read1688(
    @Param('attemptId', new ParseUUIDPipe({ version: '4' })) attemptId: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.sourceAttempts.read1688({ organizationId, attemptId }).then(toPublicAttempt);
  }

  @Get('1688-trends/current')
  read1688Status(@CurrentOrganization() organizationId: string) {
    return this.sourceAttempts.read1688Status({ organizationId }).then(toPublicStatus);
  }

  @Put('1688-trends/attempts/:attemptId')
  complete1688(
    @Param('attemptId', new ParseUUIDPipe({ version: '4' })) attemptId: string,
    @Headers('x-source-attempt-token') token: string | undefined,
    @Body() batch: Browser1688SourceBatch,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.sourceAttempts.complete1688({
      organizationId,
      attemptId,
      attemptToken: parseAttemptToken(token),
      batch,
    }).then(toPublicAttempt);
  }

  @Post('1688-trends/attempts/:attemptId/fail')
  fail1688(
    @Param('attemptId', new ParseUUIDPipe({ version: '4' })) attemptId: string,
    @Headers('x-source-attempt-token') token: string | undefined,
    @Body() body: { code?: unknown; message?: unknown },
    @CurrentOrganization() organizationId: string,
  ) {
    return this.sourceAttempts.fail1688({
      organizationId,
      attemptId,
      attemptToken: parseAttemptToken(token),
      code: typeof body?.code === 'string' ? body.code : '',
      message: typeof body?.message === 'string' ? body.message : '',
    }).then(toPublicAttempt);
  }

  @Post('1688-trends/attempts/:attemptId/cancel')
  @HttpCode(200)
  cancel1688(
    @Param('attemptId', new ParseUUIDPipe({ version: '4' })) attemptId: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.sourceAttempts.cancel1688({ organizationId, attemptId }).then(toPublicAttempt);
  }
}
