import { IsIn, IsOptional } from 'class-validator';
import type { ProductGenerationTask } from '../../../../../ai/application/port/in/generation/product-generation-ai-trigger.port';

export class QuickProcessCandidateDto {
  @IsOptional()
  @IsIn(['all', 'detail', 'thumbnail'])
  task?: ProductGenerationTask;
}
