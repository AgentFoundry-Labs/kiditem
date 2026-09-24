import { IsIn, IsOptional } from 'class-validator';
import { DETAIL_PAGE_TEMPLATE_IDS, type DetailPageTemplateId } from '@kiditem/shared/ai';
import type { ProductGenerationTask } from '../../../../../content/application/port/in/generation/product-generation-ai-trigger.port';

export class QuickProcessCandidateDto {
  @IsOptional()
  @IsIn(['all', 'detail', 'thumbnail'])
  task?: ProductGenerationTask;

  /** 상세페이지 템플릿. 없으면 기본 템플릿(`bold-vertical`)이다. */
  @IsOptional()
  @IsIn([...DETAIL_PAGE_TEMPLATE_IDS])
  templateId?: DetailPageTemplateId;
}
