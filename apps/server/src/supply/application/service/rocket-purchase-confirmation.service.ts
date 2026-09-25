import { Inject, Injectable } from '@nestjs/common';
import { isKiditemError, KiditemConflictError, KiditemInvalidValueError, KiditemPreconditionError } from '@kiditem/shared/errors';
import {
  isRocketWorkbookBlockingReason,
  RocketWorkbookAbandonRequestSchema,
  RocketWorkbookExportRequestSchema,
  RocketWorkbookDecisionRequestSchema,
  RocketWorkbookExportResponseSchema,
  type RocketWorkbookAbandonRequest,
  type RocketWorkbookExportRequest,
  type RocketWorkbookExportResponse,
  type RocketPurchasePreviewRequest,
} from '@kiditem/shared/rocket-purchase-preview';
import {
  ROCKET_PURCHASE_PREVIEW_PORT,
  type RocketPurchasePreviewPort,
} from '../port/in/procurement/rocket-purchase-preview.port';
import {
  ROCKET_WORKBOOK_EXPORT_TRANSACTION_PORT,
  type RocketWorkbookExportTransactionPort,
} from '../port/out/transaction/rocket-purchase-confirmation.transaction.port';
import { ROCKET_PO_CATALOG_PORT, type RocketPoCatalogPort } from '../../../orders/application/port/in/rocket-po-catalog.port';
import {
  buildRocketConfirmationWorkbook,
  fillRocketConfirmationWorkbook,
  RocketConfirmationWorkbookConversionRequestSchema,
} from './rocket-confirmation-workbook';
import type { RocketWorkbookExportPort } from '../port/in/procurement/rocket-purchase-confirmation.port';

@Injectable()
export class RocketWorkbookExportService
implements RocketWorkbookExportPort {
  constructor(
    @Inject(ROCKET_PURCHASE_PREVIEW_PORT)
    private readonly previewPort: RocketPurchasePreviewPort,
    @Inject(ROCKET_WORKBOOK_EXPORT_TRANSACTION_PORT)
    private readonly transactions: RocketWorkbookExportTransactionPort,
    @Inject(ROCKET_PO_CATALOG_PORT)
    private readonly catalog: RocketPoCatalogPort,
  ) {}

  async convertWorkbook(input: {
    request: unknown;
    templateBytes?: Buffer;
    templateFileName?: string;
  }) {
    const parsed = RocketConfirmationWorkbookConversionRequestSchema.safeParse(input.request);
    if (!parsed.success) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'CONVERSION_REQUEST_INVALID' }, cause: parsed.error });
    }
    const templateFileName = input.templateFileName ?? parsed.data.templateFileName;
    if (input.templateBytes !== undefined && !templateFileName) {
      throw new KiditemInvalidValueError('SUPPLY_ROCKET_WORKBOOK_FILE_INVALID', { details: { reason: 'TEMPLATE_FILENAME_REQUIRED' } });
    }
    if (input.templateBytes !== undefined
      && (input.templateBytes.byteLength === 0
        || input.templateBytes.byteLength > 10 * 1024 * 1024)) {
      throw new KiditemInvalidValueError('SUPPLY_ROCKET_WORKBOOK_FILE_INVALID', { details: { reason: 'TEMPLATE_SIZE_INVALID' } });
    }
    const now = parsed.data.now ? new Date(parsed.data.now) : undefined;
    try {
      if (input.templateBytes !== undefined) {
        return await fillRocketConfirmationWorkbook({
          template: input.templateBytes,
          templateFileName: templateFileName!,
          sourceRows: parsed.data.sourceRows,
          workbookRows: parsed.data.workbookRows,
          now,
        });
      }
      if (templateFileName) {
        throw new KiditemInvalidValueError('SUPPLY_ROCKET_WORKBOOK_FILE_INVALID', { details: { reason: 'TEMPLATE_FILE_MISSING' } });
      }
      return await buildRocketConfirmationWorkbook({
        sourceRows: parsed.data.sourceRows,
        workbookRows: parsed.data.workbookRows,
        now,
      });
    } catch (error) {
      if (isKiditemError(error)) throw error;
      throw new KiditemInvalidValueError('SUPPLY_ROCKET_WORKBOOK_FILE_INVALID', { cause: error });
    }
  }

  async exportWorkbook(input: {
    organizationId: string;
    userId: string;
    request: RocketWorkbookExportRequest;
    artifactBytes: Buffer;
  }): Promise<RocketWorkbookExportResponse> {
    const publicRequest = RocketWorkbookExportRequestSchema.parse(input.request);
    const source = await this.catalog.readComplete({ organizationId: input.organizationId, channelAccountId: publicRequest.channelAccountId, rocketPoOperationId: publicRequest.rocketPoOperationId });
    const { rocketPoOperationId, inventoryAttemptId, ...decisionFields } = publicRequest;
    const request = RocketWorkbookDecisionRequestSchema.parse({ ...decisionFields, collection: source.collection, rows: source.rows });
    if (input.artifactBytes.byteLength === 0 || input.artifactBytes.byteLength > 10 * 1024 * 1024) {
      throw new KiditemInvalidValueError('SUPPLY_ROCKET_WORKBOOK_FILE_INVALID', { details: { reason: 'ARTIFACT_SIZE_INVALID' } });
    }
    const { selectedPoLineIds } = request;
    const preview = await this.previewPort.preview({
      organizationId: input.organizationId,
      userId: input.userId,
      request: {
        channelAccountId: publicRequest.channelAccountId,
        rocketPoOperationId,
        inventoryAttemptId,
        editedQuantities: publicRequest.editedQuantities,
        previewScope: 'confirmation_requested',
      } satisfies RocketPurchasePreviewRequest,
    });
    if (!preview.catalog) {
      throw new KiditemPreconditionError('SUPPLY_ROCKET_COLLECTION_INCOMPLETE');
    }
    const selectedLineIds = new Set(
      selectedPoLineIds ?? request.rows.map(({ poLineId }) => poLineId),
    );
    const selectedPreviewRows = preview.rows.filter(({ poLineId }) =>
      selectedLineIds.has(poLineId));
    if (selectedPreviewRows.length !== selectedLineIds.size) {
      throw new KiditemConflictError('SUPPLY_ROCKET_PREVIEW_CHANGED', { details: { reason: 'SELECTED_ROWS_CHANGED' } });
    }
    if (selectedPreviewRows.some(({ reason }) => isRocketWorkbookBlockingReason(reason))) {
      throw new KiditemPreconditionError('SUPPLY_ROCKET_RECIPE_REQUIRED');
    }
    const decisionRequest = RocketWorkbookDecisionRequestSchema.parse({
      ...request,
      rows: request.rows.filter(({ poLineId }) => selectedLineIds.has(poLineId)),
    });
    const decisionPreview = {
      ...preview,
      rows: selectedPreviewRows,
    };
    return RocketWorkbookExportResponseSchema.parse(
      await this.transactions.exportWorkbook({
        organizationId: input.organizationId,
        userId: input.userId,
        rocketPoOperationId: preview.catalog.rocketPoOperationId,
        request: decisionRequest,
        preview: decisionPreview,
        artifactBytes: input.artifactBytes,
      }),
    );
  }

  async getActiveWorkflow(input: {
    organizationId: string;
  }): Promise<RocketWorkbookExportResponse | null> {
    const result = await this.transactions.getActiveWorkflow(input);
    return result === null ? null : RocketWorkbookExportResponseSchema.parse(result);
  }

  downloadWorkbook(input: {
    organizationId: string;
    exportId: string;
  }): Promise<{ fileName: string; contentType: string; bytes: Buffer }> {
    return this.transactions.downloadWorkbook(input);
  }

  async abandonWorkbook(input: {
    organizationId: string;
    userId: string;
    request: RocketWorkbookAbandonRequest;
  }): Promise<RocketWorkbookExportResponse> {
    const request = RocketWorkbookAbandonRequestSchema.parse(input.request);
    return RocketWorkbookExportResponseSchema.parse(
      await this.transactions.abandonWorkbook({
        organizationId: input.organizationId,
        userId: input.userId,
        exportId: request.exportId,
      }),
    );
  }

  listExportedPoLineIds(input: {
    organizationId: string;
    channelAccountId: string;
    poLineIds: string[];
  }): Promise<string[]> {
    return this.transactions.listExportedPoLineIds(input);
  }
}
