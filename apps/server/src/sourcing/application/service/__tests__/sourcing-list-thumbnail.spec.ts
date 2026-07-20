import { describe, expect, it, vi } from 'vitest';
import { SourcingService } from '../sourcing.service';

/**
 * 수집상품 **목록**의 대표 썸네일 되읽기.
 *
 * `sourcing_candidates.thumbnail_url` 은 수집 원본이라 대표를 바꿔 저장해도
 * 그대로 남는다. 대표는 준비(`ProductPreparation`) 또는 후보 워크스페이스가
 * 소유하므로, 목록도 상세(`getProduct`)와 같은 우선순위로 되읽어야 카드가
 * 저장한 이미지를 보여준다.
 */
const ORG = 'org-1';

const candidate = (overrides: Record<string, unknown> = {}) => ({
  id: 'cand-1',
  name: '4000과일바구니딸깍이키링',
  thumbnailUrl: 'https://cdn.example.com/scrape-original.png',
  productPreparation: null,
  productPreparations: [],
  images: [],
  ...overrides,
});

function buildService(input: {
  items: Array<Record<string, unknown>>;
  workspaceThumbnails: Map<string, { url: string; sourceThumbnailGenerationId: string | null; sourceThumbnailCandidateId: string | null }>;
}) {
  const listSourced = vi.fn().mockResolvedValue({ total: input.items.length, items: input.items });
  const findCurrentThumbnails = vi.fn().mockResolvedValue(input.workspaceThumbnails);
  const findCurrentThumbnail = vi.fn();
  const service = new SourcingService(
    { listSourced } as never,
    {} as never,
    {} as never,
    { findCurrentThumbnails, findCurrentThumbnail } as never,
    {} as never,
    {} as never,
  );
  return { service, listSourced, findCurrentThumbnails, findCurrentThumbnail };
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
          productPreparation: {
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
      sourceCandidateIds: ['cand-1', 'cand-2', 'cand-3'],
    });
    expect(findCurrentThumbnail).not.toHaveBeenCalled();
  });
});
