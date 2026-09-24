import { describe, expect, it, vi } from 'vitest';
import { ListingThumbnailEvaluationService } from '../listing-thumbnail-evaluation.service';
import { TextJudgementService } from '../text-judgement.service';

// 모델 미선택은 조용히 기본값으로 가지 않고 AGENT_OS_MODEL_REQUIRED(한국어 문장)로 멈춘다(루트 CLAUDE.md·ADR-0023).
describe('explicit model selection', () => {
  it('text judgement without a model answers AGENT_OS_MODEL_REQUIRED and never calls the provider', async () => {
    const complete = vi.fn();
    const service = new TextJudgementService({ complete } as never);
    await expect(service.judge({ system: 's', user: 'u', model: '  ' } as never))
      .rejects.toMatchObject({ code: 'AGENT_OS_MODEL_REQUIRED', httpStatus: 400 });
    expect(complete).not.toHaveBeenCalled();
  });

  it('listing thumbnail evaluation without a vision model answers AGENT_OS_MODEL_REQUIRED', async () => {
    const find = vi.fn();
    const service = new ListingThumbnailEvaluationService({ find } as never, {} as never);
    await expect(service.evaluate({ organizationId: 'o', channelListingId: 'l', imageUrl: 'https://x/y.png', modelId: '' }))
      .rejects.toMatchObject({ code: 'AGENT_OS_MODEL_REQUIRED' });
    expect(find).not.toHaveBeenCalled();
  });
});
