// Cross-domain adapter binding advertising's consumer-side keyword judge to
// AI's owner-side `TEXT_JUDGEMENT_PORT`. This is the only advertising file
// that reaches into the AI domain's port surface.

import { Inject, Injectable } from '@nestjs/common';
import {
  TEXT_JUDGEMENT_PORT,
  type TextJudgementPort,
} from '../../../../ai/application/port/in/capability/text-judgement.port';
import type {
  KeywordRelevanceJudgePort,
  KeywordRelevanceJudgeRequest,
  KeywordRelevanceJudgeResult,
} from '../../../application/port/out/cross-domain/keyword-relevance-judge.port';

/**
 * Model for keyword relevance. Read explicitly — an unset value throws rather
 * than falling back, because a silently different model would still return
 * confident-looking verdicts that propose pausing live ads.
 */
const KEYWORD_RELEVANCE_MODEL_ENV = 'AD_KEYWORD_RELEVANCE_MODEL';

@Injectable()
export class KeywordRelevanceJudgeAdapter implements KeywordRelevanceJudgePort {
  constructor(
    @Inject(TEXT_JUDGEMENT_PORT)
    private readonly textJudgement: TextJudgementPort,
  ) {}

  async judge(
    request: KeywordRelevanceJudgeRequest,
  ): Promise<KeywordRelevanceJudgeResult> {
    const model = (process.env[KEYWORD_RELEVANCE_MODEL_ENV] ?? '').trim();
    if (!model) {
      throw new Error(
        `${KEYWORD_RELEVANCE_MODEL_ENV} is not set — 키워드 연관성 판정에 사용할 모델을 지정해 주세요.`,
      );
    }
    const result = await this.textJudgement.judge({
      system: request.system,
      user: request.user,
      model,
      // Relevance is a classification, not a creative task.
      temperature: 0,
      json: true,
      ...(request.signal ? { signal: request.signal } : {}),
    });
    return { text: result.text };
  }
}
