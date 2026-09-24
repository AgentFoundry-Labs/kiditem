import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Header,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CHANNEL_DOCUMENT_EXPORT_PORT, type ChannelDocumentExportPort } from '../../../application/port/in/registration/channel-document-export.port';

type UploadedTemplateFile = {
  buffer: Buffer;
  originalname: string;
};

@Controller('channels/coupang-wing')
export class CoupangWingRegistrationExportController {
  constructor(
    @Inject(CHANNEL_DOCUMENT_EXPORT_PORT) private readonly exporter: ChannelDocumentExportPort,
  ) {}

  @Post('registration-export')
  @Header('Access-Control-Expose-Headers', 'Content-Disposition')
  @UseInterceptors(
    FileInterceptor('template', { limits: { fileSize: 20 * 1024 * 1024 } }),
  )
  exportRegistration(
    @UploadedFile() template: UploadedTemplateFile | undefined,
    @Body('products') productsPayload: string | undefined,
    @Body('fileName') fileName: string | undefined,
    @CurrentOrganization() _organizationId: string,
    @Res({ passthrough: true }) response: Response,
  ): StreamableFile {
    if (!template?.buffer) {
      throw new BadRequestException('WING 양식 템플릿이 필요합니다.');
    }
    if (!productsPayload) {
      throw new BadRequestException('등록할 상품이 없습니다.');
    }

    let products: unknown;
    try {
      products = JSON.parse(productsPayload);
    } catch {
      throw new BadRequestException('WING 상품 데이터가 유효한 JSON이 아닙니다.');
    }

    const requestedFileName = typeof fileName === 'string' ? fileName : undefined;
    const result = this.exporter.registration(template.buffer, products, requestedFileName);
    response.setHeader('Content-Disposition', contentDisposition(result.fileName));
    response.setHeader('Content-Type', result.contentType);
    response.setHeader('X-Wing-Registration-Products', String(result.productCount));
    response.setHeader('X-Wing-Registration-Rows', String(result.rowCount));
    return new StreamableFile(Buffer.from(result.buffer));
  }
}

function contentDisposition(fileName: string): string {
  const asciiFallback = fileName.replace(/[^\x20-\x7E]/g, '_');
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
