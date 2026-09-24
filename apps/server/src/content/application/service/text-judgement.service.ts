// Owner-side implementation of `TEXT_JUDGEMENT_PORT`. Thin by design: it maps
// the published judgement surface onto AI's own text-completion provider so
// consuming domains never see the provider contract.

import { Inject, Injectable } from '@nestjs/common';
import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import type {
  TextJudgementPort,
  TextJudgementRequest,
  TextJudgementResult,
} from '../port/in/capability/text-judgement.port';
import {
  TEXT_COMPLETION_PORT,
  type TextCompletionPort,
} from '../port/out/provider/text-completion.port';

@Injectable()
export class TextJudgementService implements TextJudgementPort {
  constructor(
    @Inject(TEXT_COMPLETION_PORT)
    private readonly textCompletion: TextCompletionPort,
  ) {}

  async judge(request: TextJudgementRequest): Promise<TextJudgementResult> {
    if (!request.model.trim()) {
      throw new KiditemInvalidValueError('AGENT_OS_MODEL_REQUIRED');
    }
    const result = await this.textCompletion.complete({
      system: request.system,
      user: request.user,
      model: request.model,
      temperature: request.temperature,
      ...(request.json ? { responseMimeType: 'application/json' as const } : {}),
      ...(request.signal ? { signal: request.signal } : {}),
    });
    return { text: result.text };
  }
}
