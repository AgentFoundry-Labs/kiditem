import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CsService } from '../cs.service';

function makePrisma() {
  return {
    cSRecord: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([]),
    },
  };
}

const ORGANIZATION_ID = 'organization-1';
const LISTING_ID = '11111111-1111-1111-1111-111111111111';
const LEGACY_PRODUCT_ID = '22222222-2222-2222-2222-222222222222';

describe('CsService.create', () => {
  let service: CsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new CsService(prisma as any);
    vi.clearAllMocks();
    prisma.cSRecord.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'cs-1', ...data }));
  });

  it('creates with listingId → listingId 저장', async () => {
    await service.create(
      {
        csType: 'inquiry',
        content: '배송 문의',
        listingId: LISTING_ID,
      },
      ORGANIZATION_ID,
    );

    expect(prisma.cSRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        csType: 'inquiry',
        content: '배송 문의',
        listingId: LISTING_ID,
        csStatus: '접수',
      }),
    });
  });

  it('creates with legacy productId alias → listingId 로 매핑', async () => {
    await service.create(
      {
        csType: 'inquiry',
        content: '상품 문의',
        productId: LEGACY_PRODUCT_ID,
      },
      ORGANIZATION_ID,
    );

    expect(prisma.cSRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        listingId: LEGACY_PRODUCT_ID,
      }),
    });
  });

  it('prefers listingId over productId when both provided', async () => {
    await service.create(
      {
        csType: 'inquiry',
        content: '둘 다 보낸 케이스',
        listingId: LISTING_ID,
        productId: LEGACY_PRODUCT_ID,
      },
      ORGANIZATION_ID,
    );

    expect(prisma.cSRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        listingId: LISTING_ID,
      }),
    });
  });

  it('creates without listing association when neither provided → listingId null', async () => {
    await service.create(
      {
        csType: 'inquiry',
        content: '일반 문의',
      },
      ORGANIZATION_ID,
    );

    expect(prisma.cSRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        listingId: null,
      }),
    });
  });
});
