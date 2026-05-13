import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import type { MulterFile } from '../../../../common/types';
import { DetailPageAiService } from '../../../application/service/detail-page-ai.service';
import { DetailPageAgentReconcileService } from '../../../application/service/detail-page-agent-reconcile.service';
import { GenerateDetailPageBodyDto, PrefillDetailPageBodyDto } from './dto';
import { ReconcileDetailPageBodyDto } from './dto/detail-page-reconcile.dto';

const MAX_DETAIL_PAGE_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_DETAIL_PAGE_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

class SaveDetailPageEditedHtmlDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2_000_000)
  html!: string;
}

@Controller('ai/detail-page')
export class DetailPageAiController {
  constructor(
    private readonly service: DetailPageAiService,
    private readonly reconcile: DetailPageAgentReconcileService,
  ) {}

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

  @Get()
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  list(
    @CurrentOrganization() organizationId: string,
    @Query('productId') productId?: string,
    @Query('templateId') templateId?: string,
  ) {
    return this.service.list(organizationId, productId, templateId);
  }

  @Get(':id')
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.service.getById(id, organizationId);
  }

  @Post(':id/edited-html')
  saveEditedHtml(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentOrganization() organizationId: string,
    @Body() body: SaveDetailPageEditedHtmlDto,
  ) {
    return this.service.saveEditedHtml(id, organizationId, body.html);
  }

  @Get(':id/edited-html')
  getEditedHtml(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.service.getEditedHtml(id, organizationId);
  }

  @Post(':id/cancel')
  cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.service.cancel(id, organizationId);
  }

  @Delete(':id')
  remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.service.remove(id, organizationId);
  }

  /**
   * Admin-triggered reconcile for the detail-page Agent OS pipeline.
   *
   * Replays terminal `AgentRunRequest` rows whose originating
   * `ContentGeneration` is still `PROCESSING` — recovery path for the
   * hot-path bus event. See agent-os/AGENTS.md "Recovery contract".
   *
   * Idempotent (the sink short-circuits when the row is already terminal),
   * so this can be invoked freely. Restricted to owner/admin to avoid
   * accidental load amplification.
   */
  @Post('reconcile-stuck')
  @Roles('owner', 'admin')
  reconcileStuck(
    @Body() body: ReconcileDetailPageBodyDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.reconcile.reconcile(organizationId, {
      sinceMinutes: body.sinceMinutes,
      limit: body.limit,
    });
  }
}
