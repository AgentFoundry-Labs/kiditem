import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { NotFoundException } from '@nestjs/common';
import type { ThumbnailWingRepositoryPort } from '../application/port/out/thumbnail-wing.repository.port';
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
  const repository: ThumbnailWingRepositoryPort = {
    findGenerationWithCandidates: (generationId, organizationId) =>
      prisma.thumbnailGeneration.findFirst({
        where: { id: generationId, organizationId },
        include: {
          candidates: {
            where: { organizationId },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          },
        },
      }),
    findRegistrableMaster: (masterId, organizationId) =>
      prisma.masterProduct.findFirst({
        where: { id: masterId, organizationId, isDeleted: false },
        select: {
          name: true,
          listings: {
            where: { organizationId, channel: 'coupang', isDeleted: false },
            select: { channelName: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
            take: 1,
          },
        },
      }),
    findGenerationWithLatestAttempt: (id, organizationId) =>
      prisma.thumbnailGeneration.findFirst({
        where: { id, organizationId },
        include: {
          registrationAttempts: {
            where: { organizationId },
            orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
            take: 1,
          },
        },
      }),
    ensureGenerationExists: async (id, organizationId) => {
      const existing = await prisma.thumbnailGeneration.findFirst({
        where: { id, organizationId },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException(`ThumbnailGeneration ${id} not found`);
    },
    createRegistrationAttempt: (generationId, organizationId) =>
      prisma.thumbnailRegistrationAttempt.create({
        data: {
          organizationId,
          generationId,
          status: 'running',
          startedAt: new Date(),
        },
        select: { id: true },
      }),
    updateRegistrationAttemptOrThrow: async (id, organizationId, data, generationId) => {
      const result = await prisma.thumbnailRegistrationAttempt.updateMany({
        where: { id, organizationId, ...(generationId ? { generationId } : {}) },
        data,
      });
      if (result.count === 0) {
        throw new NotFoundException(`ThumbnailRegistrationAttempt ${id} not found`);
      }
    },
    deleteFailedRegistrationAttempts: async (generationId, organizationId) => {
      await prisma.thumbnailRegistrationAttempt.deleteMany({
        where: { generationId, organizationId, status: 'failed' },
      });
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
  const automationRunner = {
    runWingUpload: vi.fn(async () => ({ success: true })),
    checkPlaywriterStatus: vi.fn(async () => ({ connected: true })),
  };
  const service = new ThumbnailWingService(
    repository,
    imageFetcher as never,
    automationRunner as never,
  );
  return { service, prisma, imageFetcher, automationRunner };
}

describe('ThumbnailWingService', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = originalNodeEnv;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('depends on application output ports for Wing persistence and image fetches', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../application/service/thumbnail-wing.service.ts'),
      'utf8',
    );

    expect(source).toContain('THUMBNAIL_WING_REPOSITORY_PORT');
    expect(source).toContain('IMAGE_FETCH_PORT');
    expect(source).not.toContain('adapter/out/prisma/thumbnail-wing.persistence');
    expect(source).not.toContain('ThumbnailImageFetcherService');
  });

  it('prepares a per-browser Wing registration payload without running Playwriter', async () => {
    const { service, prisma, imageFetcher, automationRunner } = makeService();

    const prepared = await service.prepareWingRegistration(GENERATION_ID, ORGANIZATION_ID);

    expect(prepared).toEqual({
      attemptId: 'attempt-1',
      generationId: GENERATION_ID,
      productName: '쿠팡 상품명',
      image: {
        dataUrl: 'data:image/png;base64,aW1hZ2U=',
        filename: `${GENERATION_ID}.png`,
        mimeType: 'image/png',
      },
    });
    expect(imageFetcher.fetchTrustedStorageImage).toHaveBeenCalledWith(
      'http://storage.local/kiditem/thumbnail-generations/a.png',
    );
    expect(automationRunner.runWingUpload).not.toHaveBeenCalled();
    expect(prisma.thumbnailRegistrationAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        generationId: GENERATION_ID,
        status: 'running',
      }),
      select: { id: true },
    });
  });

  it('completes a browser-backed Wing registration as uploaded with a scoped write', async () => {
    const { service, prisma } = makeService();

    const result = await service.completeWingRegistration(GENERATION_ID, ORGANIZATION_ID, {
      attemptId: 'attempt-1',
      success: true,
      screenshotUrl: 'chrome-extension://capture/attempt-1.png',
    });

    expect(result).toEqual({
      success: true,
      screenshotPath: 'chrome-extension://capture/attempt-1.png',
    });
    expect(prisma.thumbnailRegistrationAttempt.updateMany).toHaveBeenCalledWith({
      where: { id: 'attempt-1', organizationId: ORGANIZATION_ID, generationId: GENERATION_ID },
      data: expect.objectContaining({
        status: 'uploaded',
        errorMessage: null,
        screenshotUrl: 'chrome-extension://capture/attempt-1.png',
      }),
    });
  });

  it('completes a browser-backed Wing registration as failed with a scoped write', async () => {
    const { service, prisma } = makeService();

    const result = await service.completeWingRegistration(GENERATION_ID, ORGANIZATION_ID, {
      attemptId: 'attempt-1',
      success: false,
      error: 'dropzone missing',
    });

    expect(result).toEqual({
      success: false,
      screenshotPath: null,
      error: 'dropzone missing',
    });
    expect(prisma.thumbnailRegistrationAttempt.updateMany).toHaveBeenCalledWith({
      where: { id: 'attempt-1', organizationId: ORGANIZATION_ID, generationId: GENERATION_ID },
      data: expect.objectContaining({
        status: 'failed',
        errorMessage: 'dropzone missing',
        screenshotUrl: null,
      }),
    });
  });

  it('blocks the legacy server-side Playwriter registration in production', async () => {
    const { service, prisma, automationRunner } = makeService();
    process.env.NODE_ENV = 'production';

    await expect(service.registerToWing(GENERATION_ID, ORGANIZATION_ID)).rejects.toThrow(
      'Chrome 확장 프로그램',
    );

    expect(automationRunner.runWingUpload).not.toHaveBeenCalled();
    expect(prisma.thumbnailRegistrationAttempt.create).not.toHaveBeenCalled();
  });

  it('registers through Playwriter locally and records current-schema registration attempts', async () => {
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
        status: 'running',
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
