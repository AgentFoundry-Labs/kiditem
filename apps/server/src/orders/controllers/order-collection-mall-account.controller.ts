import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { CurrentOrganization } from '../../auth/decorators/current-organization.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import {
  OrderCollectionMallAccountService,
  type OrderCollectionMallAccount,
  type UpdateOrderCollectionMallAccountInput,
} from '../services/order-collection-mall-account.service';

@Controller('orders/collection/malls')
export class OrderCollectionMallAccountController {
  constructor(private readonly accounts: OrderCollectionMallAccountService) {}

  @Get()
  list(
    @CurrentOrganization() organizationId: string,
  ): Promise<OrderCollectionMallAccount[]> {
    return this.accounts.list(organizationId);
  }

  @Patch(':mallKey')
  @Roles('owner', 'admin')
  update(
    @CurrentOrganization() organizationId: string,
    @Param('mallKey') mallKey: string,
    @Body() body: UpdateOrderCollectionMallAccountInput,
  ): Promise<OrderCollectionMallAccount> {
    return this.accounts.update(organizationId, mallKey, body);
  }
}
