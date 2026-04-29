import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ThumbnailWingService } from '../services/thumbnail-wing.service';

const COMPANY_ID = 'company-1';
const GENERATION_ID = '7d000000-0000-4000-8000-000000000010';

function makeService() {
  const prisma = {
    thumbnailGeneration: {
      findFirst: vi.fn(async () => ({
        id: GENERATION_ID,
        masterId: 'master-1',
        selectedUrl: 'http://storage.local/kiditem/thumbnail-generations/a.png',
        candidates: [],
        master: {
          name: 'Master product',
          listings: [{ channelName: '쿠팡 상품명' }],
        },
      })),
    },
    masterProduct: {
      findFirst: vi.fn(async () => ({
        id: 'master-1',
        name: 'Master product',
        listings: [{ channelName: '쿠팡 상품명' }],
      })),
    },
    thumbnailRegistrationAttempt: {
      create: vi.fn(async () => ({ id: 'attempt-1' })),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
  };
  const imageFetcher = {
    assertSupportedMime: vi.fn(),
    fetchTrustedStorageImage: vi.fn(async () => ({
      buffer: Buffer.from('image'),
      mimeType: 'image/png',
      storageKey: 'thumbnail-generations/a.png',
    })),
    extForMime: vi.fn(() => 'png'),
  };
  const service = new ThumbnailWingService(prisma as never, imageFetcher as never);
  vi.spyOn(service as unknown as { runAutomation: () => Promise<{ success: boolean }> }, 'runAutomation')
    .mockResolvedValue({ success: true });
  return { service, prisma, imageFetcher };
}

describe('ThumbnailWingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers through Playwriter and records current-schema registration attempts', async () => {
    const { service, prisma, imageFetcher } = makeService();

    const result = await service.registerToWing(GENERATION_ID, COMPANY_ID);

    expect(result).toMatchObject({ success: true, screenshotPath: `/tmp/wing-upload-${GENERATION_ID}.png` });
    expect(imageFetcher.fetchTrustedStorageImage).toHaveBeenCalledWith(
      'http://storage.local/kiditem/thumbnail-generations/a.png',
    );
    expect(prisma.thumbnailRegistrationAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: COMPANY_ID,
        generationId: GENERATION_ID,
        status: 'uploaded',
      }),
      select: { id: true },
    });
    expect(prisma.thumbnailRegistrationAttempt.updateMany).toHaveBeenCalledWith({
      where: { id: 'attempt-1', companyId: COMPANY_ID },
      data: expect.objectContaining({
        status: 'uploaded',
        errorMessage: null,
        screenshotUrl: `/tmp/wing-upload-${GENERATION_ID}.png`,
      }),
    });
  });

  it('clears failed registration attempts instead of touching removed legacy columns', async () => {
    const { service, prisma } = makeService();

    await service.clearRegistrationError(GENERATION_ID, COMPANY_ID);

    expect(prisma.thumbnailRegistrationAttempt.deleteMany).toHaveBeenCalledWith({
      where: { generationId: GENERATION_ID, companyId: COMPANY_ID, status: 'failed' },
    });
  });

  it('marks the registration attempt failed when image materialization fails', async () => {
    const { service, prisma, imageFetcher } = makeService();
    imageFetcher.fetchTrustedStorageImage.mockRejectedValueOnce(new Error('image fetch failed'));

    await expect(service.registerToWing(GENERATION_ID, COMPANY_ID)).rejects.toThrow(
      'image fetch failed',
    );

    expect(prisma.thumbnailRegistrationAttempt.updateMany).toHaveBeenCalledWith({
      where: { id: 'attempt-1', companyId: COMPANY_ID },
      data: expect.objectContaining({
        status: 'failed',
        errorMessage: 'image fetch failed',
      }),
    });
  });

  it('successful registration update is scoped to companyId in the write path', async () => {
    const { service, prisma } = makeService();

    await service.registerToWing(GENERATION_ID, COMPANY_ID);

    expect(prisma.thumbnailRegistrationAttempt.updateMany).toHaveBeenCalledWith({
      where: { id: 'attempt-1', companyId: COMPANY_ID },
      data: expect.objectContaining({
        status: 'uploaded',
        errorMessage: null,
        screenshotUrl: `/tmp/wing-upload-${GENERATION_ID}.png`,
      }),
    });
  });

  it('failed registration throws NotFound when the scoped attempt update is a no-op', async () => {
    const { service, prisma, imageFetcher } = makeService();
    imageFetcher.fetchTrustedStorageImage.mockRejectedValueOnce(new Error('image fetch failed'));
    prisma.thumbnailRegistrationAttempt.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.registerToWing(GENERATION_ID, COMPANY_ID)).rejects.toThrow(
      'ThumbnailRegistrationAttempt attempt-1 not found',
    );
  });

  it('does not create a registration attempt until the generation master is confirmed in the caller company', async () => {
    const { service, prisma } = makeService();
    prisma.masterProduct.findFirst.mockResolvedValueOnce(null);

    await expect(service.registerToWing(GENERATION_ID, COMPANY_ID)).rejects.toThrow(
      'MasterProduct master-1 not found',
    );

    expect(prisma.masterProduct.findFirst).toHaveBeenCalledWith({
      where: { id: 'master-1', companyId: COMPANY_ID, isDeleted: false },
      select: {
        name: true,
        listings: {
          where: { companyId: COMPANY_ID, channel: 'coupang', isDeleted: false },
          select: { channelName: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });
    expect(prisma.thumbnailRegistrationAttempt.create).not.toHaveBeenCalled();
  });
});
