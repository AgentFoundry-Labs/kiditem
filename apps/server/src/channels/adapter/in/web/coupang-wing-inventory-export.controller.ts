import {
  Body,
  Controller,
  Inject,
  Header,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CHANNEL_DOCUMENT_EXPORT_PORT, type ChannelDocumentExportPort } from '../../../application/port/in/registration/channel-document-export.port';

@Controller('channels/coupang-wing')
export class CoupangWingInventoryExportController {
  constructor(
    @Inject(CHANNEL_DOCUMENT_EXPORT_PORT) private readonly exporter: ChannelDocumentExportPort,
  ) {}

  @Post('inventory-export')
  @Header('Access-Control-Expose-Headers', 'Content-Disposition')
  exportInventory(
    @Body() body: unknown,
    // Reading the current organization is the authentication/tenant boundary
    // for this transient export even though the bytes are not persisted.
    @CurrentOrganization() _organizationId: string,
    @Res({ passthrough: true }) response: Response,
  ): StreamableFile {
    const products = isRecord(body) ? body.products : undefined;
    const requestedFileName = isRecord(body) && typeof body.fileName === 'string'
      ? body.fileName
      : undefined;
    const result = requestedFileName === undefined
      ? this.exporter.inventory(products, new Date())
      : this.exporter.inventory(products, new Date(), requestedFileName);
    response.setHeader('Content-Disposition', contentDisposition(result.fileName));
    response.setHeader('Content-Type', result.contentType);
    response.setHeader('X-Wing-Inventory-Export-Rows', String(result.rowCount));
    return new StreamableFile(Buffer.from(result.buffer));
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function contentDisposition(fileName: string): string {
  const asciiFallback = fileName.replace(/[^\x20-\x7E]/g, '_');
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
