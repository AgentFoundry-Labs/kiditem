import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import { SourcingShadowSignalService } from '../../../application/service/sourcing-shadow-signal.service';
import {
  MARKET_SHADOW_OPERATION_PORT,
  type MarketShadowOperationPort,
} from '../../../application/port/out/cross-domain/market-shadow-operation.port';
import { TrendHistoryQueryDto } from './dto';

@Controller('sourcing/trend/shadow')
export class MarketShadowSignalController {
  constructor(
    @Inject(MARKET_SHADOW_OPERATION_PORT)
    private readonly operations: MarketShadowOperationPort,
    private readonly shadowSignals: SourcingShadowSignalService,
  ) {}

  @Post('collect')
  @HttpCode(HttpStatus.ACCEPTED)
  collect(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.operations.startShadowCollection({
      organizationId,
      requestedByUserId: user.id,
      triggerSource: 'domain_screen',
    });
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
