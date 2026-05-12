import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostPromotionAiService } from '../post-promotion-ai.service';

describe('PostPromotionAiService', () => {
  let svc: PostPromotionAiService;
  let agentRunner: any;

  beforeEach(() => {
    agentRunner = {
      runByType: vi.fn().mockResolvedValue({ ok: true, runId: 'run-1' }),
    };
    svc = new PostPromotionAiService(agentRunner);
  });

  it('enqueues detail_page_generate + thumbnail_generate with default payload', async () => {
    await svc.fireForMaster('master-1', 'org-1');
    expect(agentRunner.runByType).toHaveBeenCalledWith(
      'detail_page_generate',
      expect.objectContaining({
        organizationId: 'org-1',
        payload: expect.objectContaining({ templateId: 'kids-playful' }),
      }),
    );
    expect(agentRunner.runByType).toHaveBeenCalledWith(
      'thumbnail_generate',
      expect.objectContaining({ organizationId: 'org-1' }),
    );
  });

  it('swallows individual agent failures (fire-and-forget)', async () => {
    agentRunner.runByType
      .mockRejectedValueOnce(new Error('agent down'))  // detail_page
      .mockResolvedValueOnce({ ok: true, runId: 'run-2' });  // thumbnail
    await expect(svc.fireForMaster('master-2', 'org-1')).resolves.toBeUndefined();
    expect(agentRunner.runByType).toHaveBeenCalledTimes(2);
  });
});
