import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DETAIL_PAGE_CLIENT_RENDER_OUTPUT_WIDTH,
  DETAIL_PAGE_CLIENT_RENDER_VARIANT,
} from '@kiditem/shared/ai';
import { DetailPageClientRenderService } from './detail-page-client-render.service';

const sharp: typeof import('sharp') = require('sharp');

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_USER_ID = '33333333-3333-4333-8333-333333333333';
const WORKSPACE_ID = '44444444-4444-4444-8444-444444444444';
const REVISION_ID = '55555555-5555-4555-8555-555555555555';
const DETAIL_PAGE_ID = '66666666-6666-4666-8666-666666666666';
const INTENT_ID = '77777777-7777-4777-8777-777777777777';
const IMAGE_ARTIFACT_ID = '88888888-8888-4888-8888-888888888888';
const OBJECT_KEY =
  `detail-page-images/${ORG_ID}/${REVISION_ID}/wing-client-jpeg-v1-780.jpg`;
const SERVER_OBJECT_KEY =
  `detail-page-images/${ORG_ID}/${REVISION_ID}/wing-server-jpeg-v1-780.jpg`;
const NOW = new Date('2026-07-26T00:00:00.000Z');

function savedDetailPage(html = '<main><img src="/hero.jpg"></main>') {
  return {
    id: REVISION_ID,
    detailPageId: DETAIL_PAGE_ID,
    html,
    createdAt: new Date('2026-07-25T00:00:00.000Z'),
  };
}

function intent(overrides: Record<string, unknown> = {}) {
  return {
    id: INTENT_ID,
    organizationId: ORG_ID,
    detailPageId: DETAIL_PAGE_ID,
    revisionId: REVISION_ID,
    variant: DETAIL_PAGE_CLIENT_RENDER_VARIANT,
    outputWidth: DETAIL_PAGE_CLIENT_RENDER_OUTPUT_WIDTH,
    objectKey: OBJECT_KEY,
    state: 'issued',
    attempt: 1,
    expiresAt: new Date(NOW.getTime() + 15 * 60_000),
    requestedByUserId: USER_ID,
    claimedByUserId: null,
    claimedAt: null,
    uploadedAt: null,
    completedAt: null,
    failedAt: null,
    failureCode: null,
    failureMessage: null,
    completedArtifactId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function imageArtifact(overrides: Record<string, unknown> = {}) {
  return {
    id: IMAGE_ARTIFACT_ID,
    organizationId: ORG_ID,
    revisionId: REVISION_ID,
    variant: DETAIL_PAGE_CLIENT_RENDER_VARIANT,
    outputWidth: DETAIL_PAGE_CLIENT_RENDER_OUTPUT_WIDTH,
    objectKey: OBJECT_KEY,
    imageUrl: `https://cdn.example.com/${OBJECT_KEY}`,
    contentType: 'image/jpeg',
    byteLength: 2048,
    pixelWidth: 780,
    pixelHeight: 7846,
    sha256: 'a'.repeat(64),
    rendererKind: 'chrome-extension-cdp',
    createdByUserId: USER_ID,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('DetailPageClientRenderService', () => {
  const detailPages = {
    findWorkspaceRevision: vi.fn(),
    findRevision: vi.fn(),
  };
  const images = {
    findArtifact: vi.fn(),
    findActiveIntent: vi.fn(),
    createIntent: vi.fn(),
    findIntent: vi.fn(),
    claimIntent: vi.fn(),
    completeIntent: vi.fn(),
    failIntent: vi.fn(),
    expireIntent: vi.fn(),
  };
  const storage = {
    save: vi.fn(),
    createPresignedPut: vi.fn(),
    inspectJpeg: vi.fn(),
    getUrl: vi.fn((key: string) => `https://cdn.example.com/${key}`),
  };
  const templateStyles = { getCompiledCss: vi.fn(() => '.detail { display: block; }') };
  const rasterization = { render: vi.fn() };
  let service: DetailPageClientRenderService;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WEB_ORIGIN = 'https://office.kiditem.example';
    service = new DetailPageClientRenderService(
      detailPages as never,
      images as never,
      storage as never,
      templateStyles,
      rasterization as never,
      () => NOW,
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('저장 HTML이 없거나 비어 있으면 명시적인 missing을 반환한다', async () => {
    detailPages.findWorkspaceRevision
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(savedDetailPage('   '));

    await expect(service.prepare({
      organizationId: ORG_ID,
      userId: USER_ID,
      contentWorkspaceId: WORKSPACE_ID,
    })).resolves.toMatchObject({ status: 'missing', reason: 'no_saved_detail_page' });
    await expect(service.prepare({
      organizationId: ORG_ID,
      userId: USER_ID,
      contentWorkspaceId: WORKSPACE_ID,
    })).resolves.toMatchObject({ status: 'missing', reason: 'empty_html' });
  });

  it('현재 revision의 확정 artifact가 있으면 새 intent 없이 ready를 반환한다', async () => {
    detailPages.findWorkspaceRevision.mockResolvedValue(savedDetailPage());
    images.findArtifact.mockResolvedValue(imageArtifact({
      variant: 'wing-server-jpeg-v1',
      objectKey: SERVER_OBJECT_KEY,
      imageUrl: `https://cdn.example.com/${SERVER_OBJECT_KEY}`,
      rendererKind: 'server-puppeteer',
    }));

    const result = await service.prepare({
      organizationId: ORG_ID,
      userId: USER_ID,
      contentWorkspaceId: WORKSPACE_ID,
    });

    expect(result).toMatchObject({
      status: 'ready',
      artifactId: IMAGE_ARTIFACT_ID,
      revisionId: REVISION_ID,
      outputWidth: 780,
    });
    expect(images.createIntent).not.toHaveBeenCalled();
    expect(rasterization.render).not.toHaveBeenCalled();
  });

  /** KID-321: 등록 대상이 고른 revision 을 렌더한다 — 그 작업공간의 revision 일 때만. */
  it('고른 revision이 있으면 현재 revision 대신 그 revision의 확정 artifact를 쓴다', async () => {
    const chosen = '99999999-9999-4999-8999-999999999999';
    detailPages.findWorkspaceRevision.mockResolvedValue({ ...savedDetailPage(), id: chosen });
    images.findArtifact.mockResolvedValue(imageArtifact({
      variant: 'wing-server-jpeg-v1', objectKey: SERVER_OBJECT_KEY,
      imageUrl: `https://cdn.example.com/${SERVER_OBJECT_KEY}`, rendererKind: 'server-puppeteer',
    }));

    await expect(service.prepare({
      organizationId: ORG_ID, userId: USER_ID, contentWorkspaceId: WORKSPACE_ID, detailPageRevisionId: chosen,
    })).resolves.toMatchObject({ status: 'ready' });
    expect(detailPages.findWorkspaceRevision).toHaveBeenCalledWith({
      organizationId: ORG_ID, contentWorkspaceId: WORKSPACE_ID, revisionId: chosen,
    });
    expect(images.findArtifact).toHaveBeenCalledWith(expect.objectContaining({ revisionId: chosen }));
  });

  it('고른 revision이 이 작업공간의 것이 아니면 400으로 거절하고 렌더하지 않는다', async () => {
    detailPages.findWorkspaceRevision.mockResolvedValue(null);
    await expect(service.prepare({
      organizationId: ORG_ID, userId: USER_ID, contentWorkspaceId: WORKSPACE_ID,
      detailPageRevisionId: '99999999-9999-4999-8999-999999999999',
    })).rejects.toMatchObject({ code: 'CONTENT_SELECTION_INVALID', details: { reason: 'DETAIL_REVISION_NOT_OWNED' } });
    expect(images.createIntent).not.toHaveBeenCalled();
    expect(rasterization.render).not.toHaveBeenCalled();
  });

  it('저장 revision을 서버에서 780px JPEG로 렌더하고 artifact를 확정한다', async () => {
    detailPages.findWorkspaceRevision.mockResolvedValue(savedDetailPage());
    images.findArtifact.mockResolvedValue(null);
    images.createIntent.mockImplementation(async (value) => intent(value));
    images.claimIntent.mockImplementation(async () => ({
      status: 'claimed',
      intent: intent({
        state: 'claimed',
        claimedByUserId: USER_ID,
        variant: 'wing-server-jpeg-v1',
        objectKey: SERVER_OBJECT_KEY,
      }),
    }));
    const jpeg = await sharp({
      create: {
        width: 780,
        height: 1200,
        channels: 3,
        background: '#ffffff',
      },
    }).jpeg({ quality: 82 }).toBuffer();
    rasterization.render.mockResolvedValue({ buffer: jpeg, contentType: 'image/jpeg' });
    storage.save.mockResolvedValue(`https://cdn.example.com/${SERVER_OBJECT_KEY}`);
    images.completeIntent.mockImplementation(async (value) => imageArtifact({
      variant: 'wing-server-jpeg-v1',
      objectKey: SERVER_OBJECT_KEY,
      imageUrl: `https://cdn.example.com/${SERVER_OBJECT_KEY}`,
      byteLength: value.byteLength,
      pixelWidth: value.pixelWidth,
      pixelHeight: value.pixelHeight,
      sha256: value.sha256,
      rendererKind: value.rendererKind,
    }));

    const result = await service.prepare({
      organizationId: ORG_ID,
      userId: USER_ID,
      contentWorkspaceId: WORKSPACE_ID,
    });

    expect(result).toMatchObject({
      status: 'ready',
      imageUrl: `https://cdn.example.com/${SERVER_OBJECT_KEY}`,
      outputWidth: 780,
      contentType: 'image/jpeg',
      byteLength: jpeg.byteLength,
    });
    expect(images.createIntent).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORG_ID,
      detailPageId: DETAIL_PAGE_ID,
      revisionId: REVISION_ID,
      objectKey: SERVER_OBJECT_KEY,
      variant: 'wing-server-jpeg-v1',
      outputWidth: 780,
    }));
    expect(rasterization.render).toHaveBeenCalledWith(expect.objectContaining({
      html: expect.stringContaining('<base href="https://office.kiditem.example/"'),
      viewportWidth: 720,
      outputWidth: 780,
      format: 'jpeg',
      quality: 82,
    }));
    expect(storage.save).toHaveBeenCalledWith(
      SERVER_OBJECT_KEY,
      jpeg,
      'image/jpeg',
    );
    expect(images.completeIntent).toHaveBeenCalledWith(expect.objectContaining({
      rendererKind: 'server-puppeteer',
      pixelWidth: 780,
      pixelHeight: 1200,
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
  });

  it('서버 렌더 실패를 intent에 기록하고 빈 artifact로 진행하지 않는다', async () => {
    detailPages.findWorkspaceRevision.mockResolvedValue(savedDetailPage());
    images.findArtifact.mockResolvedValue(null);
    images.createIntent.mockImplementation(async (value) => intent({
      ...value,
      variant: 'wing-server-jpeg-v1',
      objectKey: SERVER_OBJECT_KEY,
    }));
    images.claimIntent.mockResolvedValue({
      status: 'claimed',
      intent: intent({
        state: 'claimed',
        claimedByUserId: USER_ID,
        variant: 'wing-server-jpeg-v1',
        objectKey: SERVER_OBJECT_KEY,
      }),
    });
    images.failIntent.mockResolvedValue(intent({
      state: 'failed',
      failureCode: 'server_render_failed',
      failureMessage: 'Chromium launch failed',
    }));
    rasterization.render.mockRejectedValue(new Error('Chromium launch failed'));

    await expect(service.prepare({
      organizationId: ORG_ID,
      userId: USER_ID,
      contentWorkspaceId: WORKSPACE_ID,
    })).rejects.toThrow('Chromium launch failed');

    expect(images.failIntent).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      intentId: INTENT_ID,
      failureCode: 'server_render_failed',
      failureMessage: 'Chromium launch failed',
      failedAt: NOW,
    });
    expect(storage.save).not.toHaveBeenCalled();
    expect(images.completeIntent).not.toHaveBeenCalled();
  });

  it('claim은 다른 claimant를 거부하고 소유자에게만 고정 업로드 정보를 준다', async () => {
    images.findIntent.mockResolvedValue(intent());
    images.claimIntent
      .mockResolvedValueOnce({ status: 'conflict', intent: intent({
        state: 'claimed',
        claimedByUserId: OTHER_USER_ID,
      }) })
      .mockResolvedValueOnce({ status: 'claimed', intent: intent({
        state: 'claimed',
        claimedByUserId: USER_ID,
      }) });
    storage.createPresignedPut.mockResolvedValue({
      uploadUrl: 'https://upload.example.com/signed',
      headers: { 'Content-Type': 'image/jpeg' },
      expiresAt: new Date(NOW.getTime() + 5 * 60_000),
      imageUrl: `https://cdn.example.com/${OBJECT_KEY}`,
    });

    await expect(service.claim({
      organizationId: ORG_ID,
      userId: USER_ID,
      intentId: INTENT_ID,
    })).rejects.toMatchObject({ code: 'STATE_CONFLICT', details: { reason: 'RENDER_CLAIMED_BY_OTHER' } });

    const result = await service.claim({
      organizationId: ORG_ID,
      userId: USER_ID,
      intentId: INTENT_ID,
    });
    expect(result).toMatchObject({
      intentId: INTENT_ID,
      revisionId: REVISION_ID,
      outputWidth: 780,
      renderDocumentUrl:
      `https://office.kiditem.example/detail-page-client-render?intentId=${INTENT_ID}`,
      upload: { url: 'https://upload.example.com/signed' },
    });
    expect(storage.createPresignedPut).toHaveBeenCalledWith(expect.objectContaining({
      key: OBJECT_KEY,
      contentType: 'image/jpeg',
      metadata: {
        'intent-id': INTENT_ID,
      },
    }));
  });

  it('claim 렌더 URL은 CORS 목록 순서가 아니라 명시적인 WEB_ORIGIN을 사용한다', async () => {
    process.env.WEB_ORIGIN = 'http://kiditem-office';
    process.env.CORS_ORIGINS = [
      'http://localhost:3000',
      'http://kiditem-office',
    ].join(',');
    images.findIntent.mockResolvedValue(intent());
    images.claimIntent.mockResolvedValue({
      status: 'claimed',
      intent: intent({ state: 'claimed', claimedByUserId: USER_ID }),
    });
    storage.createPresignedPut.mockResolvedValue({
      uploadUrl: 'https://upload.example.com/signed',
      headers: { 'Content-Type': 'image/jpeg' },
      expiresAt: new Date(NOW.getTime() + 5 * 60_000),
      imageUrl: `https://cdn.example.com/${OBJECT_KEY}`,
    });

    const result = await service.claim({
      organizationId: ORG_ID,
      userId: USER_ID,
      intentId: INTENT_ID,
    });

    expect(result.renderDocumentUrl).toBe(
      `http://kiditem-office/detail-page-client-render?intentId=${INTENT_ID}`,
    );
  });

  it('개발 환경에서도 WEB_ORIGIN이 없으면 localhost로 대체하지 않는다', async () => {
    vi.stubEnv('WEB_ORIGIN', '');
    vi.stubEnv('NODE_ENV', 'development');
    images.findIntent.mockResolvedValue(intent());
    images.claimIntent.mockResolvedValue({
      status: 'claimed',
      intent: intent({ state: 'claimed', claimedByUserId: USER_ID }),
    });
    storage.createPresignedPut.mockResolvedValue({
      uploadUrl: 'https://upload.example.com/signed',
      headers: { 'Content-Type': 'image/jpeg' },
      expiresAt: new Date(NOW.getTime() + 5 * 60_000),
      imageUrl: `https://cdn.example.com/${OBJECT_KEY}`,
    });

    await expect(service.claim({
      organizationId: ORG_ID,
      userId: USER_ID,
      intentId: INTENT_ID,
    })).rejects.toThrow('Runtime configuration: WEB_ORIGIN이 필요합니다');
  });

  it('만료 intent는 claim 전에 상태를 만료시키고 거부한다', async () => {
    images.findIntent.mockResolvedValue(intent({ expiresAt: new Date(NOW.getTime() - 1) }));

    await expect(service.claim({
      organizationId: ORG_ID,
      userId: USER_ID,
      intentId: INTENT_ID,
    })).rejects.toMatchObject({ code: 'STATE_CONFLICT', details: { reason: 'RENDER_REQUEST_EXPIRED' } });
    expect(images.expireIntent).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      intentId: INTENT_ID,
      expiredAt: NOW,
    });
  });

  it('document는 렌더 의도의 상세 페이지가 아닌 revision을 렌더하지 않는다', async () => {
    images.findIntent.mockResolvedValue(intent({ state: 'claimed', claimedByUserId: USER_ID }));
    detailPages.findRevision.mockResolvedValue({ ...savedDetailPage(), detailPageId: '99999999-9999-4999-8999-999999999999' });

    await expect(service.document({ organizationId: ORG_ID, userId: USER_ID, intentId: INTENT_ID }))
      .rejects.toMatchObject({ code: 'CONTENT_NOT_FOUND', details: { reason: 'detail_revision' } });
  });

  it('document는 claimant에게 bound revision의 렌더 문서만 반환한다', async () => {
    images.findIntent.mockResolvedValue(intent({
      state: 'claimed',
      claimedByUserId: USER_ID,
    }));
    detailPages.findRevision.mockResolvedValue(savedDetailPage());

    const result = await service.document({
      organizationId: ORG_ID,
      userId: USER_ID,
      intentId: INTENT_ID,
    });

    expect(detailPages.findRevision).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      revisionId: REVISION_ID,
    });
    expect(result).toMatchObject({
      intentId: INTENT_ID,
      revisionId: REVISION_ID,
      layoutWidth: 720,
      outputWidth: 780,
      requiredAssetPolicy: 'all',
    });
    expect(result.html).toContain('<base href="https://office.kiditem.example/"');
    expect(result.html).toContain('.detail { display: block; }');

    images.findIntent.mockResolvedValue(intent({
      state: 'claimed',
      claimedByUserId: OTHER_USER_ID,
    }));
    await expect(service.document({
      organizationId: ORG_ID,
      userId: USER_ID,
      intentId: INTENT_ID,
    })).rejects.toMatchObject({ code: 'FORBIDDEN', details: { reason: 'RENDER_NOT_CLAIMANT' } });
  });

  it('fail은 claim한 사용자만 수행할 수 있다', async () => {
    images.findIntent.mockResolvedValue(intent({
      state: 'claimed',
      claimedByUserId: OTHER_USER_ID,
    }));

    await expect(service.fail({
      organizationId: ORG_ID,
      userId: USER_ID,
      intentId: INTENT_ID,
      body: { code: 'capture_failed', message: 'capture failed' },
    })).rejects.toMatchObject({ code: 'FORBIDDEN', details: { reason: 'RENDER_NOT_CLAIMANT' } });
    expect(images.failIntent).not.toHaveBeenCalled();
  });

  it('finalize는 intent fence와 SHA를 확인하고 실제 객체의 크기와 치수를 authority로 사용한다', async () => {
    const claimed = intent({ state: 'claimed', claimedByUserId: USER_ID });
    images.findIntent.mockResolvedValue(claimed);
    storage.inspectJpeg.mockResolvedValue({
      contentType: 'image/jpeg',
      byteLength: 2048,
      pixelWidth: 780,
      pixelHeight: 7846,
      sha256: 'a'.repeat(64),
      metadata: {
        'intent-id': INTENT_ID,
      },
    });
    images.completeIntent.mockResolvedValue(imageArtifact());
    const body = {
      byteLength: 1,
      pixelWidth: 780 as const,
      pixelHeight: 1,
      sha256: 'a'.repeat(64),
    };

    const first = await service.finalize({
      organizationId: ORG_ID,
      userId: USER_ID,
      intentId: INTENT_ID,
      body,
    });
    expect(first).toMatchObject({ state: 'completed', artifact: {
      artifactId: IMAGE_ARTIFACT_ID,
      imageUrl: `https://cdn.example.com/${OBJECT_KEY}`,
    } });
    expect(images.completeIntent).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORG_ID,
      intentId: INTENT_ID,
      rendererKind: 'chrome-extension-cdp',
      createdByUserId: USER_ID,
    }));

  });

  it('finalize는 다른 intent가 업로드한 객체를 거부한다', async () => {
    images.findIntent.mockResolvedValue(intent({
      state: 'claimed',
      claimedByUserId: USER_ID,
    }));
    storage.inspectJpeg.mockResolvedValue({
      contentType: 'image/jpeg',
      byteLength: 2048,
      pixelWidth: 780,
      pixelHeight: 7846,
      sha256: 'a'.repeat(64),
      metadata: { 'intent-id': '99999999-9999-4999-8999-999999999999' },
    });

    await expect(service.finalize({
      organizationId: ORG_ID,
      userId: USER_ID,
      intentId: INTENT_ID,
      body: {
        byteLength: 2048,
        pixelWidth: 780,
        pixelHeight: 7846,
        sha256: 'a'.repeat(64),
      },
    })).rejects.toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'RENDER_UPLOAD_MISMATCH' } });
  });

  it.each([
    ['SHA', { sha256: 'b'.repeat(64) }],
    ['실제 너비', { pixelWidth: 779 }],
    ['실제 높이', { pixelHeight: 50_001 }],
  ])('finalize는 잘못된 %s 검증값을 거부한다', async (_label, inspectedOverride) => {
    images.findIntent.mockResolvedValue(intent({
      state: 'claimed',
      claimedByUserId: USER_ID,
    }));
    storage.inspectJpeg.mockResolvedValue({
      contentType: 'image/jpeg',
      byteLength: 2048,
      pixelWidth: 780,
      pixelHeight: 7846,
      sha256: 'a'.repeat(64),
      metadata: { 'intent-id': INTENT_ID },
      ...inspectedOverride,
    });

    await expect(service.finalize({
      organizationId: ORG_ID,
      userId: USER_ID,
      intentId: INTENT_ID,
      body: {
        byteLength: 2048,
        pixelWidth: 780,
        pixelHeight: 7846,
        sha256: 'a'.repeat(64),
      },
    })).rejects.toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'RENDER_UPLOAD_MISMATCH' } });
  });
});
