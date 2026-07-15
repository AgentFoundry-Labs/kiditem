import { Controller, Get, Post, Query, Body, BadRequestException, Inject } from '@nestjs/common';
import { ProcurementService } from '../../../application/service/procurement.service';
import { ListPurchaseOrdersQueryDto, PurchaseOrderActionBodyDto } from './dto';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import {
  PURCHASE_ORDER_SUBMISSION_PORT,
  type PurchaseOrderSubmissionPort,
} from '../../../application/port/in/procurement/purchase-order-submission.port';

@Controller('purchase-orders')
export class ProcurementController {
  constructor(
    private readonly procurementService: ProcurementService,
    @Inject(PURCHASE_ORDER_SUBMISSION_PORT)
    private readonly submissions: PurchaseOrderSubmissionPort,
  ) {}

  @Get()
  findAll(
    @CurrentOrganization() organizationId: string,
    @Query() query: ListPurchaseOrdersQueryDto,
  ) {
    return this.procurementService.findAll(organizationId, query);
  }

  @Post()
  async handleAction(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: PurchaseOrderActionBodyDto,
  ) {
    if (body.action === 'create') {
      return this.procurementService.create(organizationId, {
        supplierName: body.supplierName!,
        supplierId: body.supplierId,
        items: body.items!,
        expectedDeliveryDate: body.expectedDeliveryDate,
      });
    }
    if (body.action === 'updateStatus') {
      return this.procurementService.updateStatus(organizationId, body.id!, body.status!);
    }
    if (body.action === 'delete') {
      return this.procurementService.delete(organizationId, body.id!);
    }
    if (body.action === 'submit') {
      return this.submissions.submit({
        organizationId,
        purchaseOrderId: body.id!,
        idempotencyKey: body.idempotencyKey!,
        userId: user.id,
        ...(body.externalOrderPlatform !== undefined && {
          externalOrderPlatform: body.externalOrderPlatform,
        }),
        ...(body.externalOrderId !== undefined && {
          externalOrderId: body.externalOrderId,
        }),
        ...(body.externalOrderUrl !== undefined && {
          externalOrderUrl: body.externalOrderUrl,
        }),
      });
    }
    if (body.action === 'reconcileSubmission') {
      return this.submissions.reconcile({
        organizationId,
        purchaseOrderId: body.id!,
        userId: user.id,
        outcome: body.outcome!,
        providerReference: body.providerReference,
      });
    }
    throw new BadRequestException(`Unknown action: ${body.action}`);
  }
}
