import { afterEach, describe, expect, it, vi } from 'vitest';
import { KeywordRelevanceJudgeAdapter } from './keyword-relevance-judge.adapter';

const previousTextModel = process.env.AI_TEXT_MODEL;
const previousKeywordModel = process.env.AD_KEYWORD_RELEVANCE_MODEL;

afterEach(() => {
  if (previousTextModel === undefined) delete process.env.AI_TEXT_MODEL;
  else process.env.AI_TEXT_MODEL = previousTextModel;

  if (previousKeywordModel === undefined) {
    delete process.env.AD_KEYWORD_RELEVANCE_MODEL;
  } else {
    process.env.AD_KEYWORD_RELEVANCE_MODEL = previousKeywordModel;
  }
});

describe('KeywordRelevanceJudgeAdapter', () => {
  it('uses the shared AI_TEXT_MODEL for deterministic JSON judgement', async () => {
    process.env.AI_TEXT_MODEL = ' gemini-text-test ';
    process.env.AD_KEYWORD_RELEVANCE_MODEL = 'legacy-keyword-model';
    const textJudgement = {
      judge: vi.fn().mockResolvedValue({ text: '{"verdicts":[]}' }),
    };
    const adapter = new KeywordRelevanceJudgeAdapter(textJudgement);

    await expect(
      adapter.judge({ system: 'rules', user: 'keywords' }),
    ).resolves.toEqual({ text: '{"verdicts":[]}' });

    expect(textJudgement.judge).toHaveBeenCalledWith({
      system: 'rules',
      user: 'keywords',
      model: 'gemini-text-test',
      temperature: 0,
      json: true,
    });
  });

  it('fails explicitly when AI_TEXT_MODEL is unset', async () => {
    delete process.env.AI_TEXT_MODEL;
    process.env.AD_KEYWORD_RELEVANCE_MODEL = 'legacy-keyword-model';
    const textJudgement = { judge: vi.fn() };
    const adapter = new KeywordRelevanceJudgeAdapter(textJudgement);

    await expect(
      adapter.judge({ system: 'rules', user: 'keywords' }),
    ).rejects.toThrow('AI_TEXT_MODEL is not set');
    expect(textJudgement.judge).not.toHaveBeenCalled();
  });
});
