import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { KiditemInvalidValueError, KiditemNotFoundError } from '@kiditem/shared/errors';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ROCKET_SAVED_PO_RESPONSE_PROFILE,
  type RocketSavedPoCollection,
} from '@kiditem/shared/rocket-purchase-preview';
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
} from '../../../../orders/application/port/in/rocket-po-catalog.port';
import { ListPurchaseOrdersQueryDto, PurchaseOrderActionBodyDto } from './dto';
import type { Response } from 'express';
import type { AuthUser } from '../../../../auth/auth.types';
import type { MulterFile } from '../../../../common/types';
import { canonicalOwnerInputHash } from '../../../../common/owner-idempotency-key';

const MAX_ROCKET_WORKBOOK_SIZE = 10 * 1024 * 1024;
const MAX_ROCKET_WORKBOOK_REQUEST_SIZE = 25 * 1024 * 1024;

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
    limits: {
      fileSize: MAX_ROCKET_WORKBOOK_SIZE,
      fieldSize: MAX_ROCKET_WORKBOOK_REQUEST_SIZE,
    },
  }))
  async handleAction(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: PurchaseOrderActionBodyDto,
    @UploadedFile() workbook?: MulterFile,
    @Res({ passthrough: true }) response?: Response,
    @Headers('x-kiditem-response-profile') responseProfile?: string,
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
      const businessInput = purchaseOrderSubmissionInput(body);
      return this.submissions.submit({
        organizationId,
        purchaseOrderId: businessInput.purchaseOrderId,
        inventoryAttemptId: businessInput.inventoryAttemptId,
        idempotencyKey: body.idempotencyKey!,
        requestHash: canonicalOwnerInputHash(businessInput),
        userId: user.id,
        ...(businessInput.externalOrderPlatform !== undefined && {
          externalOrderPlatform: businessInput.externalOrderPlatform,
        }),
        ...(businessInput.externalOrderId !== undefined && {
          externalOrderId: businessInput.externalOrderId,
        }),
        ...(businessInput.externalOrderUrl !== undefined && {
          externalOrderUrl: businessInput.externalOrderUrl,
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
      const result = await this.rocketPreview.preview({
        organizationId,
        userId: user.id,
        request: {
          channelAccountId: body.channelAccountId!,
          sourceImportRunId: body.sourceImportRunId!,
          inventoryAttemptId: body.inventoryAttemptId!,
          editedQuantities: body.editedQuantities ?? {},
          ...(body.clampEditedQuantities !== undefined && {
            clampEditedQuantities: body.clampEditedQuantities,
          }),
          ...(body.previewScope !== undefined && {
            previewScope: body.previewScope,
          }),
        },
      });
      return result;
    }
    if (body.action === 'convertRocketConfirmationWorkbook') {
      let request: unknown;
      try {
        request = JSON.parse(body.requestJson!);
      } catch {
        throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'REQUEST_JSON_INVALID' } });
      }
      const result = await this.rocketWorkbooks.convertWorkbook({
        request,
        ...(workbook && {
          templateBytes: workbook.buffer,
          templateFileName: workbook.originalname,
        }),
      });
      response?.setHeader('Content-Type', result.contentType);
      response?.setHeader(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(result.fileName)}`,
      );
      response?.setHeader('X-Rocket-Workbook-Total-Rows', String(result.summary.totalRows));
      response?.setHeader('X-Rocket-Workbook-Quantity', String(result.summary.workbookQuantity));
      response?.setHeader('X-Rocket-Workbook-Fully-Confirmed-Rows', String(result.summary.fullyConfirmedRows));
      response?.setHeader('X-Rocket-Workbook-Short-Rows', String(result.summary.shortRows));
      return new StreamableFile(result.bytes);
    }
    if (body.action === 'exportRocketWorkbook') {
      if (!workbook) throw new KiditemInvalidValueError('SUPPLY_ROCKET_WORKBOOK_FILE_INVALID', { details: { reason: 'WORKBOOK_FILE_REQUIRED' } });
      let request: unknown;
      try {
        request = JSON.parse(body.requestJson!);
      } catch {
        throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'REQUEST_JSON_INVALID' } });
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
        request: { exportId: body.exportId! },
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
      const channelAccountId = body.channelAccountId!;
      const snapshot = await this.rocketCatalog.loadSavedCollection({
        organizationId,
        channelAccountId,
        sourceImportRunId: body.sourceImportRunId!,
      });
      if (!snapshot) throw new KiditemNotFoundError('NOT_FOUND', { details: { reason: 'saved_rocket_po_collection' } });
      if (responseProfile !== ROCKET_SAVED_PO_RESPONSE_PROFILE) return snapshot;
      // Channels owns the snapshot, Supply owns workbook evidence. Compose here so the
      // operator can separate lines that are new since their last Excel.
      const exportedPoLineIds = await this.rocketWorkbooks.listExportedPoLineIds({
        organizationId,
        channelAccountId,
        poLineIds: snapshot.rows.map(({ poLineId }) => poLineId),
      });
      return { ...snapshot, exportedPoLineIds } satisfies RocketSavedPoCollection;
    }
    throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'ACTION_UNKNOWN', action: body.action } });
  }
}

function purchaseOrderSubmissionInput(body: PurchaseOrderActionBodyDto): {
  purchaseOrderId: string;
  inventoryAttemptId: string;
  externalOrderPlatform?: string | null;
  externalOrderId?: string | null;
  externalOrderUrl?: string | null;
} {
  return {
    purchaseOrderId: body.id!,
    inventoryAttemptId: body.inventoryAttemptId!,
    ...(body.externalOrderPlatform !== undefined && {
      externalOrderPlatform: body.externalOrderPlatform,
    }),
    ...(body.externalOrderId !== undefined && {
      externalOrderId: body.externalOrderId,
    }),
    ...(body.externalOrderUrl !== undefined && {
      externalOrderUrl: body.externalOrderUrl,
    }),
  };
}
