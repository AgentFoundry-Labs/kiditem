import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { SourcingShadowSignalService } from '../../../application/service/sourcing-shadow-signal.service';
import { TrendHistoryQueryDto } from './dto';
import type { AuthUser } from '../../../../auth/auth.types';

const IdempotencyKeySchema = z.string().uuid();
const CollectRequestSchema = z.object({}).strict();

@Controller('sourcing/trend/shadow')
export class MarketShadowSignalController {
  constructor(
    private readonly shadowSignals: SourcingShadowSignalService,
  ) {}

  @Post('collect')
  @HttpCode(HttpStatus.OK)
  collect(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Body() body?: unknown,
  ) {
    const key = IdempotencyKeySchema.safeParse(idempotencyKey);
    if (!key.success) throw new BadRequestException('INVALID_IDEMPOTENCY_KEY');
    if (!CollectRequestSchema.safeParse(body ?? {}).success) {
      throw new BadRequestException('INVALID_SHADOW_REQUEST');
    }
    return this.shadowSignals.collect({
      organizationId,
      requestedByUserId: user.id,
      idempotencyKey: key.data,
    });
  }

  @Get('status')
  status(@CurrentOrganization() organizationId: string) {
    return this.shadowSignals.getStatus(organizationId);
  }

  @Get('attempts/:attemptId')
  readAttempt(
    @CurrentOrganization() organizationId: string,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
  ) {
    return this.shadowSignals.readAttempt(organizationId, attemptId);
  }

  @Get()
  async listRecent(
    @Query() query: TrendHistoryQueryDto,
    @CurrentOrganization() organizationId: string,
  ) {
    const snapshots = await this.shadowSignals.listRecent(
      organizationId,
      query.days ?? 30,
    );
    return { snapshots };
  }
}
