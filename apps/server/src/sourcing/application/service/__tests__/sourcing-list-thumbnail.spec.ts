import { describe, expect, it, vi } from 'vitest';
import { SourcingService } from '../sourcing.service';
import type { SourcingAgentCommandService } from '../sourcing-agent-command.service';

/**
 * 수집상품 **목록**의 대표 썸네일 되읽기.
 *
 * `sourcing_candidates.thumbnail_url` 은 수집 원본이라 대표를 바꿔 저장해도
 * 그대로 남는다. 대표는 등록 설정(`RegistrationTarget`) 또는 그 후보의 판매상품
 * 초안이 가진 작업공간이 소유하므로(KID-310), 목록도 상세(`getProduct`)와 같은
 * 우선순위로 되읽어야 카드가 저장한 이미지를 보여준다.
 */
const ORG = 'org-1';

const candidate = (overrides: Record<string, unknown> = {}) => ({
  id: 'cand-1',
  name: '4000과일바구니딸깍이키링',
  thumbnailUrl: 'https://cdn.example.com/scrape-original.png',
  registrationTarget: null,
  productPreparations: [],
  images: [],
  ...overrides,
});

/** 후보 id 에 `-draft` 를 붙인 초안 id. 목록이 후보 → 초안을 한 번에 옮기는 것을 본다. */
const draftIdOf = (candidateId: string) => `${candidateId}-draft`;

function buildService(input: {
  items: Array<Record<string, unknown>>;
  workspaceThumbnails: Map<string, { url: string; sourceThumbnailGenerationId: string | null; sourceThumbnailCandidateId: string | null }>;
}) {
  const listSourced = vi.fn().mockResolvedValue({ total: input.items.length, items: input.items });
  const findCurrentThumbnails = vi.fn().mockResolvedValue(
    new Map([...input.workspaceThumbnails].map(([candidateId, thumbnail]) => [draftIdOf(candidateId), thumbnail])),
  );
  const findCurrentThumbnail = vi.fn();
  const findDraftIdsForSources = vi.fn().mockImplementation(async (_org: string, candidateIds: string[]) =>
    new Map(candidateIds.map((candidateId) => [candidateId, draftIdOf(candidateId)])));
  const service = new SourcingService(
    { listSourced } as never,
    {} as never,
    { findCurrentThumbnails, findCurrentThumbnail } as never,
    {} as SourcingAgentCommandService,
    {} as never,
    { findDraftIdsForSources } as never,
  );
  return { service, listSourced, findCurrentThumbnails, findCurrentThumbnail, findDraftIdsForSources };
}

describe('SourcingService.listProducts 대표 썸네일', () => {
  it('준비가 없는 후보는 워크스페이스에 저장된 대표를 목록에 실어 보낸다', async () => {
    const { service } = buildService({
      items: [candidate()],
      workspaceThumbnails: new Map([
        ['cand-1', {
          url: 'https://cdn.example.com/saved-representative.jpg',
          sourceThumbnailGenerationId: null,
          sourceThumbnailCandidateId: null,
        }],
      ]),
    });

    const result = await service.listProducts({}, ORG);

    expect(result.items[0].selectedThumbnailUrl).toBe(
      'https://cdn.example.com/saved-representative.jpg',
    );
    // 후보 원본은 덮어쓰지 않는다. 어떤 이미지가 왜 보이는지가 응답에 남아야 한다.
    expect(result.items[0].thumbnailUrl).toBe('https://cdn.example.com/scrape-original.png');
  });

  it('준비의 대표가 워크스페이스 선택을 이긴다', async () => {
    const { service } = buildService({
      items: [
        candidate({
          registrationTarget: {
            selectedThumbnailUrl: 'https://cdn.example.com/preparation.jpg',
          },
        }),
      ],
      workspaceThumbnails: new Map([
        ['cand-1', {
          url: 'https://cdn.example.com/workspace.jpg',
          sourceThumbnailGenerationId: null,
          sourceThumbnailCandidateId: null,
        }],
      ]),
    });

    const result = await service.listProducts({}, ORG);

    expect(result.items[0].selectedThumbnailUrl).toBe('https://cdn.example.com/preparation.jpg');
  });

  it('저장된 대표가 없으면 null 이고, 원본으로 조용히 채우지 않는다', async () => {
    const { service } = buildService({
      items: [candidate()],
      workspaceThumbnails: new Map(),
    });

    const result = await service.listProducts({}, ORG);

    expect(result.items[0].selectedThumbnailUrl).toBeNull();
  });

  it('페이지 전체를 한 번에 조회한다 (후보별 단건 조회는 N+1)', async () => {
    const { service, findCurrentThumbnails, findCurrentThumbnail } = buildService({
      items: [candidate(), candidate({ id: 'cand-2' }), candidate({ id: 'cand-3' })],
      workspaceThumbnails: new Map(),
    });

    await service.listProducts({}, ORG);

    expect(findCurrentThumbnails).toHaveBeenCalledTimes(1);
    expect(findCurrentThumbnails).toHaveBeenCalledWith({
      organizationId: ORG,
      salesProductIds: ['cand-1-draft', 'cand-2-draft', 'cand-3-draft'],
    });
    expect(findCurrentThumbnail).not.toHaveBeenCalled();
  });
});
