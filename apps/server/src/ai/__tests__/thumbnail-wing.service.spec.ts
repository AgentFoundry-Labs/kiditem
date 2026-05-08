import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ThumbnailWingPersistence } from '../adapter/out/prisma/thumbnail-wing.persistence';
import { ThumbnailWingService } from '../application/service/thumbnail-wing.service';

const ORGANIZATION_ID = 'organization-1';
const GENERATION_ID = '7d000000-0000-4000-8000-000000000010';

function makeService() {
  const prisma = {
    thumbnailGeneration: {
      findFirst: vi.fn(async () => ({
        id: GENERATION_ID,
        masterId: 'master-1',
        selectedUrl: 'http://storage.local/kiditem/thumbnail-generations/a.png',
        candidates: [],
        registrationAttempts: [],
      })),
    },
    masterProduct: {
      findFirst: vi.fn(async () => ({
        name: 'Master product',
        listings: [{ channelName: '쿠팡 상품명' }],
      })),
    },
    thumbnailRegistrationAttempt: {
      create: vi.fn(async () => ({ id: 'attempt-1' })),
      updateMany: vi.fn(async () => ({ count: 1 })),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
  };
  const persistence = new ThumbnailWingPersistence(prisma as never);
  const imageFetcher = {
    assertSupportedMime: vi.fn(),
    fetchTrustedStorageImage: vi.fn(async () => ({
      buffer: Buffer.from('image'),
      mimeType: 'image/png',
      storageKey: 'thumbnail-generations/a.png',
    })),
    extForMime: vi.fn(() => 'png'),
  };
  const automationRunner = {
    runWingUpload: vi.fn(async () => ({ success: true })),
    checkPlaywriterStatus: vi.fn(async () => ({ connected: true })),
  };
  const service = new ThumbnailWingService(
    persistence,
    imageFetcher as never,
    automationRunner as never,
  );
  return { service, prisma, imageFetcher, automationRunner };
}

describe('ThumbnailWingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers through Playwriter and records current-schema registration attempts', async () => {
    const { service, prisma, imageFetcher, automationRunner } = makeService();

    const result = await service.registerToWing(GENERATION_ID, ORGANIZATION_ID);

    expect(result).toMatchObject({ success: true, screenshotPath: `/tmp/wing-upload-${GENERATION_ID}.png` });
    expect(imageFetcher.fetchTrustedStorageImage).toHaveBeenCalledWith(
      'http://storage.local/kiditem/thumbnail-generations/a.png',
    );
    expect(automationRunner.runWingUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        productName: '쿠팡 상품명',
        screenshotPath: `/tmp/wing-upload-${GENERATION_ID}.png`,
      }),
    );
    expect(prisma.thumbnailRegistrationAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        generationId: GENERATION_ID,
        status: 'uploaded',
      }),
      select: { id: true },
    });
    expect(prisma.thumbnailRegistrationAttempt.updateMany).toHaveBeenCalledWith({
      where: { id: 'attempt-1', organizationId: ORGANIZATION_ID },
      data: expect.objectContaining({
        status: 'uploaded',
        errorMessage: null,
        screenshotUrl: `/tmp/wing-upload-${GENERATION_ID}.png`,
      }),
    });
  });

  it('decodes URL-encoded Coupang product names before Wing automation', async () => {
    const { service, prisma, automationRunner } = makeService();
    prisma.masterProduct.findFirst.mockResolvedValueOnce({
      name: 'Master product',
      listings: [
        {
          channelName:
            '%ED%83%9C%EC%96%91%EA%B4%91%EB%B3%80%EC%8B%A0%EB%A1%9C%EB%B4%87%2F%EB%B3%80%EC%8B%A0%EB%A1%9C%EB%B4%87%2F%EA%B5%90%EC%9C%A1%EC%99%84%EA%B5%AC',
        },
      ],
    });

    await service.registerToWing(GENERATION_ID, ORGANIZATION_ID);

    expect(automationRunner.runWingUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        productName: '태양광변신로봇/변신로봇/교육완구',
      }),
    );
  });

  it('clears failed registration attempts instead of touching removed legacy columns', async () => {
    const { service, prisma } = makeService();

    await service.clearRegistrationError(GENERATION_ID, ORGANIZATION_ID);

    expect(prisma.thumbnailGeneration.findFirst).toHaveBeenCalledWith({
      where: { id: GENERATION_ID, organizationId: ORGANIZATION_ID },
      select: { id: true },
    });
    expect(prisma.thumbnailRegistrationAttempt.deleteMany).toHaveBeenCalledWith({
      where: { generationId: GENERATION_ID, organizationId: ORGANIZATION_ID, status: 'failed' },
    });
  });

  it('marks the registration attempt failed when image materialization fails', async () => {
    const { service, prisma, imageFetcher } = makeService();
    imageFetcher.fetchTrustedStorageImage.mockRejectedValueOnce(new Error('image fetch failed'));

    await expect(service.registerToWing(GENERATION_ID, ORGANIZATION_ID)).rejects.toThrow(
      'image fetch failed',
    );

    expect(prisma.thumbnailRegistrationAttempt.updateMany).toHaveBeenCalledWith({
      where: { id: 'attempt-1', organizationId: ORGANIZATION_ID },
      data: expect.objectContaining({
        status: 'failed',
        errorMessage: 'image fetch failed',
      }),
    });
  });

  it('successful registration update is scoped to organizationId in the write path', async () => {
    const { service, prisma } = makeService();

    await service.registerToWing(GENERATION_ID, ORGANIZATION_ID);

    expect(prisma.thumbnailRegistrationAttempt.updateMany).toHaveBeenCalledWith({
      where: { id: 'attempt-1', organizationId: ORGANIZATION_ID },
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

    await expect(service.registerToWing(GENERATION_ID, ORGANIZATION_ID)).rejects.toThrow(
      'ThumbnailRegistrationAttempt attempt-1 not found',
    );
  });

  it('does not create a registration attempt until the generation master is confirmed in the caller organization', async () => {
    const { service, prisma } = makeService();
    prisma.masterProduct.findFirst.mockResolvedValueOnce(null);

    await expect(service.registerToWing(GENERATION_ID, ORGANIZATION_ID)).rejects.toThrow(
      'MasterProduct master-1 not found',
    );

    expect(prisma.masterProduct.findFirst).toHaveBeenCalledWith({
      where: { id: 'master-1', organizationId: ORGANIZATION_ID, isDeleted: false },
      select: {
        name: true,
        listings: {
          where: { organizationId: ORGANIZATION_ID, channel: 'coupang', isDeleted: false },
          select: { channelName: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });
    expect(prisma.thumbnailRegistrationAttempt.create).not.toHaveBeenCalled();
  });

  it('checkPlaywriterStatus delegates to the automation adapter', async () => {
    const { service, automationRunner } = makeService();

    const status = await service.checkPlaywriterStatus();

    expect(status).toEqual({ connected: true });
    expect(automationRunner.checkPlaywriterStatus).toHaveBeenCalledTimes(1);
  });
});
