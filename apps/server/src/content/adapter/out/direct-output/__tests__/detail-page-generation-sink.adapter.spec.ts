import { describe, expect, it, vi } from 'vitest';
import { KiditemConflictError, KiditemNotFoundError } from '@kiditem/shared/errors';
import { DetailPageGenerationSinkAdapter } from '../detail-page-generation-sink.adapter';
import { DetailPageGenerationRepositoryAdapter } from '../../repository/detail-page-generation.repository.adapter';

const ORG = '00000000-0000-4000-8000-000000000001';
const PAGE = '00000000-0000-4000-8000-000000000002';

/** 확인과 잠금 사이에 다른 결과·취소가 페이지를 끝낸 경우 — 상태 전이가 STATE_CONFLICT로 거절된다. */
function racingDetailPages(refusal: Error) {
  return {
    findById: vi.fn().mockResolvedValue({ id: PAGE, source: 'generated', status: 'processing', generationInput: {}, title: '장화' }),
    runInTransaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) => work({})),
    setStatus: vi.fn().mockRejectedValue(refusal),
    completeGeneration: vi.fn().mockRejectedValue(refusal),
  };
}

const lostRace = () => new KiditemConflictError('STATE_CONFLICT', { details: { reason: 'DETAIL_PAGE_STATUS_TRANSITION' } });

describe('detail-page generation terminal races (KID-343 catch 보정)', () => {
  it('a failure that loses the race to another terminal result is a no-op', async () => {
    const pages = racingDetailPages(lostRace());
    const sink = new DetailPageGenerationSinkAdapter(pages as never);

    await expect(sink.applyFailure({
      organizationId: ORG, requestId: 'direct-ai:job', sourceResourceId: PAGE, errorCode: 'provider_error', errorMessage: '모델 오류',
    })).resolves.toBeUndefined();
  });

  it('a success that loses the race to a cancellation is a no-op', async () => {
    const pages = racingDetailPages(lostRace());
    const sink = new DetailPageGenerationSinkAdapter(pages as never);

    await expect(sink.applySuccess({
      organizationId: ORG, requestId: 'direct-ai:job', sourceResourceId: PAGE,
      output: { templateId: 'kids-playful', result: {}, imageUrls: [], processedImages: {} } as never,
    })).resolves.toBeUndefined();
  });

  it('a failure still surfaces a refusal that is not a lost race', async () => {
    const pages = racingDetailPages(new KiditemNotFoundError('CONTENT_NOT_FOUND', { details: { reason: 'detail_page' } }));
    const sink = new DetailPageGenerationSinkAdapter(pages as never);

    await expect(sink.applyFailure({
      organizationId: ORG, requestId: 'direct-ai:job', sourceResourceId: PAGE, errorCode: 'provider_error', errorMessage: '모델 오류',
    })).rejects.toMatchObject({ code: 'CONTENT_NOT_FOUND' });
  });

  it('a cancellation that loses the race to a result keeps the finished generation', async () => {
    const pages = racingDetailPages(lostRace());
    const prisma = { detailPage: { findFirst: vi.fn().mockResolvedValue({ id: PAGE, status: 'processing' }) } };
    const directJobs = { lockLive: vi.fn().mockResolvedValue(['job-1']), cancelJobs: vi.fn() };
    const generations = new DetailPageGenerationRepositoryAdapter(prisma as never, pages as never, directJobs as never);

    await expect(generations.cancelDirectGeneration({ organizationId: ORG, detailPageId: PAGE, reason: '중단' }))
      .resolves.toEqual({ status: 'already_terminal', generationId: PAGE, preserved: true });
    expect(directJobs.cancelJobs).not.toHaveBeenCalled();
  });
});
