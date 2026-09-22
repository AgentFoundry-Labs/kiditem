import { IsIn, IsOptional } from 'class-validator';
import type { ProductGenerationTask } from '../../../../../content/application/port/in/generation/product-generation-ai-trigger.port';

export class QuickProcessCandidateDto {
  @IsOptional()
  @IsIn(['all', 'detail', 'thumbnail'])
  task?: ProductGenerationTask;
}
