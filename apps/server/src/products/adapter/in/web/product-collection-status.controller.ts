import {
  Controller,
  Get,
  Inject,
  Body,
  Post,
} from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import {
  SELLPIA_SOURCE_ACCOUNT_PORT,
  type SellpiaSourceAccountPort,
} from '../../../application/port/in/sellpia-source-account.port';
import {
  ProductSourceBindingDto,
} from './dto/product-source-binding.dto';
import type { AuthUser } from '../../../../auth/auth.types';

@Controller('inventory/sellpia-collection-status')
export class ProductCollectionStatusController {
  constructor(
    @Inject(SELLPIA_SOURCE_ACCOUNT_PORT)
    private readonly collectionStatus: SellpiaSourceAccountPort,
  ) {}

  @Get()
  getCollectionState(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.collectionStatus.getCollectionState({ organizationId, userId: user.id });
  }

  @Post('source-binding')
  @Roles('owner', 'admin')
  confirmSourceBinding(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ProductSourceBindingDto,
  ) {
    return this.collectionStatus.confirmSourceBinding({
      organizationId,
      userId: user.id,
      sourceOrigin: dto.sourceOrigin,
      sourceAccountKey: dto.sourceAccountKey,
      confirmed: dto.confirmed,
    });
  }

}
