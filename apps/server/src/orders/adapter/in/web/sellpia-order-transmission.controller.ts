import { Body, Controller, Inject, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import {
  SELLPIA_ORDER_TRANSMISSION_PORT,
  type SellpiaOrderTransmissionPort,
} from '../../../application/port/in/sellpia-order-transmission.port';
import {
  SellpiaOrderTransmissionIntentReconcileRequestDto,
  SellpiaOrderTransmissionIntentRequestDto,
} from './dto/sellpia-order-transmission.dto';

@Controller('orders/sellpia-transmissions/intents')
export class SellpiaOrderTransmissionController {
  constructor(
    @Inject(SELLPIA_ORDER_TRANSMISSION_PORT)
    private readonly transmissions: SellpiaOrderTransmissionPort,
  ) {}

  @Post('prepare')
  prepare(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SellpiaOrderTransmissionIntentRequestDto,
  ) {
    return this.transmissions.prepare({ organizationId, userId: user.id, intentKey: dto.intentKey });
  }

  @Post('finalize')
  finalize(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SellpiaOrderTransmissionIntentRequestDto,
  ) {
    return this.transmissions.finalize({ organizationId, userId: user.id, intentKey: dto.intentKey });
  }

  @Post('abort')
  abort(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SellpiaOrderTransmissionIntentRequestDto,
  ) {
    return this.transmissions.abort({ organizationId, userId: user.id, intentKey: dto.intentKey });
  }

  @Post('reconcile')
  @Roles('owner', 'admin')
  reconcile(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SellpiaOrderTransmissionIntentReconcileRequestDto,
  ) {
    return this.transmissions.reconcile({
      organizationId,
      userId: user.id,
      intentKey: dto.intentKey,
      outcome: dto.outcome,
      note: dto.note,
    });
  }
}
