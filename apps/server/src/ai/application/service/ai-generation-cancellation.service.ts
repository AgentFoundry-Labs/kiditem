import { Injectable } from '@nestjs/common';
import type {
  AiGenerationCancellationPort,
  AiGenerationCancellationTargetResult,
} from '../port/in/generation/ai-generation-cancellation.port';
import { DetailPageGenerationService } from './detail-page-generation.service';
import { ThumbnailGenerationService } from './thumbnail-generation.service';

@Injectable()
export class AiGenerationCancellationService
  implements AiGenerationCancellationPort
{
  constructor(
    private readonly detailPages: DetailPageGenerationService,
    private readonly thumbnails: ThumbnailGenerationService,
  ) {}

  cancelContentGeneration(input: {
    organizationId: string;
    generationId: string;
    actorUserId: string | null;
    reason: string;
    notifyProductGenerationParent?: boolean;
  }): Promise<AiGenerationCancellationTargetResult> {
    return this.detailPages.cancelForOperation(input);
  }

  cancelThumbnailGeneration(input: {
    organizationId: string;
    generationId: string;
    actorUserId: string | null;
    reason: string;
    notifyProductGenerationParent?: boolean;
  }): Promise<AiGenerationCancellationTargetResult> {
    return this.thumbnails.cancelForOperation(input);
  }
}
