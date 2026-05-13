import { Injectable } from '@nestjs/common';
import type {
  GenerateDetailPageBodyDto,
  PrefillDetailPageBodyDto,
} from '../../adapter/in/http/dto';
import type { MulterFile } from '../../../common/types';
import type {
  DetailPageGenerationDto,
  DetailPagePrefillDto,
} from './detail-page-ai.types';
import { DetailPageGenerationService } from './detail-page-generation.service';
import { DetailPagePrefillService } from './detail-page-prefill.service';
import { DetailPageQueryService } from './detail-page-query.service';

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
    dto: GenerateDetailPageBodyDto,
    organizationId: string,
    triggeredByUserId: string | null,
  ): Promise<DetailPageGenerationDto> {
    return this.generation.generate(dto, organizationId, triggeredByUserId);
  }

  prefill(
    dto: PrefillDetailPageBodyDto,
    organizationId: string,
  ): Promise<DetailPagePrefillDto> {
    return this.prefillService.prefill(dto, organizationId);
  }

  list(
    organizationId: string,
    productId?: string,
    templateId?: string,
  ): Promise<DetailPageGenerationDto[]> {
    return this.query.list(organizationId, productId, templateId);
  }

  getById(id: string, organizationId: string): Promise<DetailPageGenerationDto> {
    return this.query.getById(id, organizationId);
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
