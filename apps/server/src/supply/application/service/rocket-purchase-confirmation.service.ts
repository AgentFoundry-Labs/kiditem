import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
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
import { ROCKET_PO_CATALOG_PORT, type RocketPoCatalogPort } from '../../../channels/application/port/in/rocket-po-catalog.port';
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
      throw new BadRequestException('Rocket workbook conversion request is invalid.');
    }
    const templateFileName = input.templateFileName ?? parsed.data.templateFileName;
    if (input.templateBytes !== undefined && !templateFileName) {
      throw new BadRequestException('Rocket workbook template filename is required.');
    }
    if (input.templateBytes !== undefined
      && (input.templateBytes.byteLength === 0
        || input.templateBytes.byteLength > 10 * 1024 * 1024)) {
      throw new BadRequestException('Rocket workbook template must be between 1 byte and 10 MiB.');
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
        throw new BadRequestException('Rocket workbook template file is missing.');
      }
      return await buildRocketConfirmationWorkbook({
        sourceRows: parsed.data.sourceRows,
        workbookRows: parsed.data.workbookRows,
        now,
      });
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Rocket workbook conversion failed.',
      );
    }
  }

  async exportWorkbook(input: {
    organizationId: string;
    userId: string;
    request: RocketWorkbookExportRequest;
    artifactBytes: Buffer;
  }): Promise<RocketWorkbookExportResponse> {
    const publicRequest = RocketWorkbookExportRequestSchema.parse(input.request);
    const source = await this.catalog.readComplete({ organizationId: input.organizationId, channelAccountId: publicRequest.channelAccountId, sourceImportRunId: publicRequest.sourceImportRunId });
    const { sourceImportRunId, inventoryAttemptId, ...decisionFields } = publicRequest;
    const request = RocketWorkbookDecisionRequestSchema.parse({ ...decisionFields, collection: source.collection, rows: source.rows });
    if (input.artifactBytes.byteLength === 0 || input.artifactBytes.byteLength > 10 * 1024 * 1024) {
      throw new BadRequestException('Rocket workbook artifact must be between 1 byte and 10 MiB.');
    }
    const { selectedPoLineIds } = request;
    const preview = await this.previewPort.preview({
      organizationId: input.organizationId,
      userId: input.userId,
      request: {
        channelAccountId: publicRequest.channelAccountId,
        sourceImportRunId,
        inventoryAttemptId,
        editedQuantities: publicRequest.editedQuantities,
        previewScope: 'confirmation_requested',
      } satisfies RocketPurchasePreviewRequest,
    });
    if (!preview.catalog) {
      throw new BadRequestException(
        'A complete Rocket PO collection is required before workbook export.',
      );
    }
    const selectedLineIds = new Set(
      selectedPoLineIds ?? request.rows.map(({ poLineId }) => poLineId),
    );
    const selectedPreviewRows = preview.rows.filter(({ poLineId }) =>
      selectedLineIds.has(poLineId));
    if (selectedPreviewRows.length !== selectedLineIds.size) {
      throw new ConflictException(
        'Selected Rocket workbook rows changed before export.',
      );
    }
    if (selectedPreviewRows.some(({ reason }) => isRocketWorkbookBlockingReason(reason))) {
      throw new BadRequestException(
        'Every Rocket workbook line requires a confirmed product recipe.',
      );
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
        sourceImportRunId: preview.catalog.sourceImportRunId,
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
