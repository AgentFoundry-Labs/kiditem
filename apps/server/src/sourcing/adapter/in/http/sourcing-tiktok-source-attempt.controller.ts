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
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import {
  SourcingTiktokSourceAttemptService,
  type BrowserTiktokSourceBatch,
} from '../../../application/service/sourcing-tiktok-source-attempt.service';
import { parseAttemptToken, toPublicAttempt, toPublicStatus } from './sourcing-source-attempt-http';
import type { AuthUser } from '../../../../auth/auth.types';

const BeginSchema = z.object({
  maxItems: z.number().int().min(1).max(100).optional(),
  region: z.string().trim().regex(/^[A-Za-z]{2,12}$/).optional(),
}).strict();

/** Direct owner HTTP seam for TikTok Creative Center collection attempts. */
@Controller('sourcing/tiktok-creative')
export class SourcingTiktokSourceAttemptController {
  constructor(private readonly sourceAttempts: SourcingTiktokSourceAttemptService) {}

  @Post('attempts')
  beginTiktok(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
  ) {
    const input = parseBegin(body);
    return this.sourceAttempts.beginTiktok({
      organizationId,
      requestedByUserId: user.id,
      idempotencyKey: idempotencyKey ?? '',
      maxItems: input.maxItems,
      region: input.region,
    });
  }

  @Get('attempts/:attemptId')
  readTiktok(
    @Param('attemptId', new ParseUUIDPipe({ version: '4' })) attemptId: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.sourceAttempts.readTiktok({ organizationId, attemptId }).then(toPublicAttempt);
  }

  @Get('current')
  readTiktokStatus(@CurrentOrganization() organizationId: string) {
    return this.sourceAttempts.readTiktokStatus({ organizationId }).then(toPublicStatus);
  }

  @Put('attempts/:attemptId')
  completeTiktok(
    @Param('attemptId', new ParseUUIDPipe({ version: '4' })) attemptId: string,
    @Headers('x-source-attempt-token') token: string | undefined,
    @Body() batch: BrowserTiktokSourceBatch,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.sourceAttempts.completeTiktok({
      organizationId,
      attemptId,
      attemptToken: parseAttemptToken(token),
      batch,
    }).then(toPublicAttempt);
  }

  @Post('attempts/:attemptId/fail')
  failTiktok(
    @Param('attemptId', new ParseUUIDPipe({ version: '4' })) attemptId: string,
    @Headers('x-source-attempt-token') token: string | undefined,
    @Body() body: { code?: unknown; message?: unknown },
    @CurrentOrganization() organizationId: string,
  ) {
    return this.sourceAttempts.failTiktok({
      organizationId,
      attemptId,
      attemptToken: parseAttemptToken(token),
      code: typeof body?.code === 'string' ? body.code : '',
      message: typeof body?.message === 'string' ? body.message : '',
    }).then(toPublicAttempt);
  }

  @Post('attempts/:attemptId/cancel')
  @HttpCode(200)
  cancelTiktok(
    @Param('attemptId', new ParseUUIDPipe({ version: '4' })) attemptId: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.sourceAttempts.cancelTiktok({ organizationId, attemptId }).then(toPublicAttempt);
  }
}

function parseBegin(value: unknown): z.infer<typeof BeginSchema> {
  const parsed = BeginSchema.safeParse(value);
  if (!parsed.success) {
    throw new BadRequestException('INVALID_TIKTOK_SOURCE_ATTEMPT_REQUEST');
  }
  return parsed.data;
}
