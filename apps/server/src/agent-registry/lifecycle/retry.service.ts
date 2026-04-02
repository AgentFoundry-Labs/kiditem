import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class RetryService {
  private readonly logger = new Logger(RetryService.name);

  buildRetryPrompt(
    originalPrompt: string,
    validationErrors: string[],
    currentRetryCount: number,
  ): string | null {
    if (currentRetryCount >= 1) return null;
    if (validationErrors.length === 0) return null;

    const errorFeedback = validationErrors.join('; ');
    return `${originalPrompt}\n\n---\nPREVIOUS OUTPUT WAS INVALID. Fix these errors:\n${errorFeedback}\n\nOutput the corrected JSON only.`;
  }
}
