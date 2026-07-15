import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import type { AuthUser } from '../../../../auth/auth.types';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import {
  SELLPIA_INVENTORY_FRESHNESS_PORT,
  type SellpiaInventoryFreshnessPort,
} from '../../../application/port/in/stock/sellpia-inventory-freshness.port';
import {
  SellpiaInventoryCancelRequestDto,
  SellpiaInventoryClaimRequestDto,
  SellpiaInventoryFailRequestDto,
  SellpiaInventoryHeartbeatRequestDto,
  SellpiaInventoryRefreshRequestDto,
  SellpiaInventorySourceBindingRequestDto,
} from './dto';

@Controller('inventory/sellpia-freshness')
export class SellpiaInventoryFreshnessController {
  constructor(
    @Inject(SELLPIA_INVENTORY_FRESHNESS_PORT)
    private readonly freshness: SellpiaInventoryFreshnessPort,
  ) {}

  @Get()
  getState(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.freshness.getState({ organizationId, userId: user.id });
  }

  @Post('source-binding')
  @Roles('owner', 'admin')
  confirmSourceBinding(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SellpiaInventorySourceBindingRequestDto,
  ) {
    return this.freshness.confirmSourceBinding({
      organizationId,
      userId: user.id,
      sourceOrigin: dto.sourceOrigin,
      sourceAccountKey: dto.sourceAccountKey,
      confirmed: dto.confirmed,
    });
  }

  @Post('requests')
  requestRefresh(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SellpiaInventoryRefreshRequestDto,
  ) {
    return this.freshness.requestRefresh({
      organizationId,
      userId: user.id,
      reason: dto.reason,
    });
  }

  @Post('claims')
  claimDue(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() _dto: SellpiaInventoryClaimRequestDto,
  ) {
    return this.freshness.claimDue({ organizationId, userId: user.id });
  }

  @Post('claims/:token/heartbeat')
  heartbeat(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('token', new ParseUUIDPipe({ version: '4' })) claimToken: string,
    @Body() _dto: SellpiaInventoryHeartbeatRequestDto,
  ) {
    return this.freshness.heartbeat({
      organizationId,
      userId: user.id,
      claimToken,
    });
  }

  @Post('claims/:token/fail')
  fail(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('token', new ParseUUIDPipe({ version: '4' })) claimToken: string,
    @Body() dto: SellpiaInventoryFailRequestDto,
  ) {
    return this.freshness.fail({
      organizationId,
      userId: user.id,
      claimToken,
      errorCode: dto.errorCode,
      errorMessage: dto.errorMessage,
    });
  }

  @Post('claims/:token/cancel')
  cancel(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('token', new ParseUUIDPipe({ version: '4' })) claimToken: string,
    @Body() _dto: SellpiaInventoryCancelRequestDto,
  ) {
    return this.freshness.cancel({
      organizationId,
      userId: user.id,
      claimToken,
    });
  }
}
