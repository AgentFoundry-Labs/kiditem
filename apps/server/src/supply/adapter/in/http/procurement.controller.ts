import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ProcurementService } from '../../../application/service/procurement.service';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import {
  PURCHASE_ORDER_SUBMISSION_PORT,
  type PurchaseOrderSubmissionPort,
} from '../../../application/port/in/procurement/purchase-order-submission.port';
import {
  ROCKET_PURCHASE_PREVIEW_PORT,
  type RocketPurchasePreviewPort,
} from '../../../application/port/in/procurement/rocket-purchase-preview.port';
import {
  ROCKET_WORKBOOK_EXPORT_PORT,
  type RocketWorkbookExportPort,
} from '../../../application/port/in/procurement/rocket-purchase-confirmation.port';
import {
  ROCKET_PO_CATALOG_PORT,
  type RocketPoCatalogPort,
} from '../../../../channels/application/port/in/rocket-po-catalog.port';
import { ListPurchaseOrdersQueryDto, PurchaseOrderActionBodyDto } from './dto';
import type { AuthUser } from '../../../../auth/auth.types';
import type { MulterFile } from '../../../../common/types';

const MAX_ROCKET_WORKBOOK_SIZE = 10 * 1024 * 1024;

@Controller('purchase-orders')
export class ProcurementController {
  constructor(
    private readonly procurementService: ProcurementService,
    @Inject(PURCHASE_ORDER_SUBMISSION_PORT)
    private readonly submissions: PurchaseOrderSubmissionPort,
    @Inject(ROCKET_PURCHASE_PREVIEW_PORT)
    private readonly rocketPreview: RocketPurchasePreviewPort,
    @Inject(ROCKET_WORKBOOK_EXPORT_PORT)
    private readonly rocketWorkbooks: RocketWorkbookExportPort,
    @Inject(ROCKET_PO_CATALOG_PORT)
    private readonly rocketCatalog: RocketPoCatalogPort,
  ) {}

  @Get()
  findAll(
    @CurrentOrganization() organizationId: string,
    @Query() query: ListPurchaseOrdersQueryDto,
  ) {
    return this.procurementService.findAll(organizationId, query);
  }

  @Post()
  @UseInterceptors(FileInterceptor('workbook', {
    limits: { fileSize: MAX_ROCKET_WORKBOOK_SIZE },
  }))
  async handleAction(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: PurchaseOrderActionBodyDto,
    @UploadedFile() workbook?: MulterFile,
    @Res({ passthrough: true }) response?: Response,
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
    if (body.action === 'previewRocket') {
      return this.rocketPreview.preview({
        organizationId,
        userId: user.id,
        request: {
          channelAccountId: body.channelAccountId!,
          collection: body.collection!,
          rows: body.rows!,
          editedQuantities: body.editedQuantities ?? {},
          ...(body.clampEditedQuantities !== undefined && {
            clampEditedQuantities: body.clampEditedQuantities,
          }),
        },
      });
    }
    if (body.action === 'exportRocketWorkbook') {
      if (!workbook) throw new BadRequestException('Rocket workbook file is required.');
      let request: unknown;
      try {
        request = JSON.parse(body.requestJson!);
      } catch {
        throw new BadRequestException('Rocket workbook request JSON is invalid.');
      }
      return this.rocketWorkbooks.exportWorkbook({
        organizationId,
        userId: user.id,
        request: request as never,
        artifactBytes: workbook.buffer,
      });
    }
    if (body.action === 'getActiveRocketWorkbook') {
      return this.rocketWorkbooks.getActiveWorkflow({ organizationId });
    }
    if (body.action === 'downloadRocketWorkbook') {
      const artifact = await this.rocketWorkbooks.downloadWorkbook({
        organizationId,
        exportId: body.exportId!,
      });
      response?.setHeader('Content-Type', artifact.contentType);
      response?.setHeader(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(artifact.fileName)}`,
      );
      return new StreamableFile(artifact.bytes);
    }
    if (body.action === 'abandonRocketWorkbook') {
      return this.rocketWorkbooks.abandonWorkbook({
        organizationId,
        userId: user.id,
        request: {
          exportId: body.exportId!,
          reason: body.abandonReason!,
        },
      });
    }
    if (body.action === 'listSavedRocketPos') {
      return this.rocketCatalog.listSavedPos({
        organizationId,
        channelAccountId: body.channelAccountId!,
        from: body.from!,
        to: body.to!,
        ...(body.rocketStatus && { status: body.rocketStatus }),
      });
    }
    if (body.action === 'loadSavedRocketCollection') {
      const collection = await this.rocketCatalog.loadSavedCollection({
        organizationId,
        channelAccountId: body.channelAccountId!,
        sourceImportRunId: body.sourceImportRunId!,
      });
      if (!collection) throw new NotFoundException('Saved Rocket PO collection not found');
      return collection;
    }
    throw new BadRequestException(`Unknown action: ${body.action}`);
  }
}
