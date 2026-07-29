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
import type { RocketWorkbookExportPort } from '../port/in/procurement/rocket-purchase-confirmation.port';

@Injectable()
export class RocketWorkbookExportService
implements RocketWorkbookExportPort {
  constructor(
    @Inject(ROCKET_PURCHASE_PREVIEW_PORT)
    private readonly previewPort: RocketPurchasePreviewPort,
    @Inject(ROCKET_WORKBOOK_EXPORT_TRANSACTION_PORT)
    private readonly transactions: RocketWorkbookExportTransactionPort,
  ) {}

  async exportWorkbook(input: {
    organizationId: string;
    userId: string;
    request: RocketWorkbookExportRequest;
    artifactBytes: Buffer;
  }): Promise<RocketWorkbookExportResponse> {
    const request = RocketWorkbookExportRequestSchema.parse(input.request);
    if (input.artifactBytes.byteLength === 0 || input.artifactBytes.byteLength > 10 * 1024 * 1024) {
      throw new BadRequestException('Rocket workbook artifact must be between 1 byte and 10 MiB.');
    }
    const {
      idempotencyKey: _idempotencyKey,
      selectedPoLineIds,
      shortageReasons: _shortageReasons,
      artifactFileName: _artifactFileName,
      artifactContentType: _artifactContentType,
      ...previewRequest
    } = request;
    const preview = await this.previewPort.preview({
      organizationId: input.organizationId,
      userId: input.userId,
      inventoryRequirement: 'fresh',
      request: previewRequest satisfies RocketPurchasePreviewRequest,
    });
    if (preview.status === 'freshness_pending') {
      throw new ConflictException(
        `Sellpia inventory refresh is still pending for generation ${preview.requestedGeneration}.`,
      );
    }
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
    const decisionRequest = RocketWorkbookExportRequestSchema.parse({
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
        sourceImportRunId: preview.catalog.run.id,
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
        reason: request.reason,
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
