import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import type { MulterFile } from '../../../../common/types';
import { DetailPageAiService } from '../../../application/service/detail-page-ai.service';
import { GenerateDetailPageBodyDto, PrefillDetailPageBodyDto } from './dto';

const MAX_DETAIL_PAGE_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_DETAIL_PAGE_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

@Controller('ai/detail-page')
export class DetailPageGenerationController {
  constructor(private readonly service: DetailPageAiService) {}

  @Post('images')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_DETAIL_PAGE_IMAGE_SIZE_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_DETAIL_PAGE_IMAGE_MIME_TYPES.has(file.mimetype)) {
          cb(new BadRequestException(`unsupported mime type: ${file.mimetype}`), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  uploadImage(
    @UploadedFile() file: MulterFile,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.service.uploadInputImage(file, organizationId);
  }

  @Post('generate')
  generate(
    @Body() body: GenerateDetailPageBodyDto,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.generate(body, organizationId, user.id);
  }

  @Post('prefill')
  prefill(
    @Body() body: PrefillDetailPageBodyDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.service.prefill(body, organizationId);
  }
}
