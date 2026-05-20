import { Injectable } from '@nestjs/common';
import type {
  GenerateDetailPageInput,
  PrefillDetailPageInput,
} from './detail-page-requests';
import type { MulterFile } from '../../../common/types';
import type {
  DetailPageGenerationDto,
  DetailPagePrefillDto,
} from './detail-page-ai.types';
import { DetailPageGenerationService } from './detail-page-generation.service';
import { DetailPagePrefillService } from './detail-page-prefill.service';
import { DetailPageQueryService, type DetailPageListQuery } from './detail-page-query.service';

@Injectable()
export class DetailPageAiService {
  constructor(
    private readonly generation: DetailPageGenerationService,
    private readonly prefillService: DetailPagePrefillService,
    private readonly query: DetailPageQueryService,
  ) {}

  uploadInputImage(
    file: MulterFile,
    organizationId: string,
  ): Promise<{ url: string }> {
    return this.generation.uploadInputImage(file, organizationId);
  }

  generate(
    dto: GenerateDetailPageInput,
    organizationId: string,
    triggeredByUserId: string | null,
  ): Promise<DetailPageGenerationDto> {
    return this.generation.generate(dto, organizationId, triggeredByUserId);
  }

  prefill(
    dto: PrefillDetailPageInput,
    organizationId: string,
  ): Promise<DetailPagePrefillDto> {
    return this.prefillService.prefill(dto, organizationId);
  }

  list(
    organizationId: string,
    query?: DetailPageListQuery,
  ): Promise<DetailPageGenerationDto[]> {
    return this.query.list(organizationId, query);
  }

  getById(id: string, organizationId: string): Promise<DetailPageGenerationDto> {
    return this.query.getById(id, organizationId);
  }

  saveEditedHtml(
    id: string,
    organizationId: string,
    html: string,
  ): Promise<{ html: string; savedAt: string; assetUrlMap: Record<string, string> }> {
    return this.query.saveEditedHtml(id, organizationId, html);
  }

  getEditedHtml(
    id: string,
    organizationId: string,
  ): Promise<{ html: string | null; savedAt: string | null }> {
    return this.query.getEditedHtml(id, organizationId);
  }

  duplicateVersion(
    id: string,
    organizationId: string,
    triggeredByUserId: string | null,
  ): Promise<DetailPageGenerationDto> {
    return this.query.duplicateVersion(id, organizationId, triggeredByUserId);
  }

  renameVersion(
    id: string,
    organizationId: string,
    title: string,
  ): Promise<{ ok: true }> {
    return this.query.renameVersion(id, organizationId, title);
  }

  cancel(id: string, organizationId: string): Promise<DetailPageGenerationDto> {
    return this.generation.cancel(id, organizationId);
  }

  remove(id: string, organizationId: string): Promise<{ ok: true }> {
    return this.query.remove(id, organizationId);
  }
}

export type {
  DetailPageGenerationDto,
  DetailPagePrefillDto,
} from './detail-page-ai.types';
