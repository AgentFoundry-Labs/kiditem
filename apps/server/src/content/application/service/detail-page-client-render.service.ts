import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  DETAIL_PAGE_CLIENT_RENDER_CONTENT_TYPE,
  DETAIL_PAGE_CLIENT_RENDER_LAYOUT_WIDTH,
  DETAIL_PAGE_CLIENT_RENDER_MAX_BYTES,
  DETAIL_PAGE_CLIENT_RENDER_MAX_HEIGHT,
  DETAIL_PAGE_CLIENT_RENDER_OUTPUT_WIDTH,
  DETAIL_PAGE_CLIENT_RENDER_VARIANT,
  type DetailPageClientRenderClaimResponse,
  type DetailPageClientRenderDocumentResponse,
  type DetailPageClientRenderFailBody,
  type DetailPageClientRenderFinalizeBody,
  type DetailPageClientRenderPrepareResponse,
  type DetailPageClientRenderStatusResponse,
} from '@kiditem/shared/ai';
import {
  DETAIL_PAGE_IMAGE_REPOSITORY_PORT,
  type DetailPageImageArtifactRecord,
  type DetailPageImageRenderIntentRecord,
  type DetailPageImageRepositoryPort,
} from '../port/out/repository/detail-page-image.repository.port';
import {
  DETAIL_PAGE_REPOSITORY_PORT,
  type DetailPageRepositoryPort,
} from '../port/out/repository/detail-page.repository.port';
import {
  DETAIL_PAGE_TEMPLATE_STYLES_PORT,
  type DetailPageTemplateStylesPort,
} from '../port/out/runtime/detail-page-template-styles.port';
import {
  IMAGE_STORAGE_PORT,
  type ImageStoragePort,
} from '../port/out/storage/image-storage.port';
import { requireWebOrigin } from '../../../common/config/web-origin';
import {
  buildRenderDocument,
  COUPANG_DETAIL_JPEG_QUALITY,
} from './detail-page-render-document';
import { DetailPageRasterizationService } from './detail-page-rasterization.service';

const sharp: typeof import('sharp')['default'] = require('sharp');

const INTENT_TTL_MS = 15 * 60_000;
const UPLOAD_URL_TTL_SECONDS = 5 * 60;
const CLIENT_RENDERER_KIND = 'chrome-extension-cdp';
const SERVER_RENDERER_KIND = 'server-puppeteer';
const SERVER_RENDER_VARIANT = 'wing-server-jpeg-v1';
export const DETAIL_PAGE_CLIENT_RENDER_CLOCK = Symbol(
  'DETAIL_PAGE_CLIENT_RENDER_CLOCK',
);

const MISSING_MESSAGES = {
  no_saved_detail_page:
    '저장된 상세페이지가 없습니다. 상세페이지를 생성하고 저장한 뒤 다시 시도하세요.',
  empty_html: '저장된 상세페이지 HTML 이 비어 있습니다. 상세페이지를 다시 저장하세요.',
} as const;

function serverObjectKey(organizationId: string, revisionId: string): string {
  return [
    'detail-page-images',
    organizationId,
    revisionId,
    `${SERVER_RENDER_VARIANT}-${DETAIL_PAGE_CLIENT_RENDER_OUTPUT_WIDTH}.jpg`,
  ].join('/');
}

function readyArtifact(
  artifact: DetailPageImageArtifactRecord,
): Extract<DetailPageClientRenderPrepareResponse, { status: 'ready' }> {
  return {
    status: 'ready',
    artifactId: artifact.id,
    revisionId: artifact.revisionId,
    imageUrl: artifact.imageUrl,
    outputWidth: DETAIL_PAGE_CLIENT_RENDER_OUTPUT_WIDTH,
    contentType: DETAIL_PAGE_CLIENT_RENDER_CONTENT_TYPE,
    byteLength: artifact.byteLength,
  };
}

function statusArtifact(artifact: DetailPageImageArtifactRecord | null | undefined) {
  if (!artifact) return null;
  return {
    artifactId: artifact.id,
    revisionId: artifact.revisionId,
    imageUrl: artifact.imageUrl,
    outputWidth: DETAIL_PAGE_CLIENT_RENDER_OUTPUT_WIDTH,
    contentType: DETAIL_PAGE_CLIENT_RENDER_CONTENT_TYPE,
    byteLength: artifact.byteLength,
    pixelWidth: DETAIL_PAGE_CLIENT_RENDER_OUTPUT_WIDTH,
    pixelHeight: artifact.pixelHeight,
    sha256: artifact.sha256,
  } as const;
}

@Injectable()
export class DetailPageClientRenderService {
  constructor(
    @Inject(DETAIL_PAGE_REPOSITORY_PORT)
    private readonly detailPages: DetailPageRepositoryPort,
    @Inject(DETAIL_PAGE_IMAGE_REPOSITORY_PORT)
    private readonly images: DetailPageImageRepositoryPort,
    @Inject(IMAGE_STORAGE_PORT)
    private readonly storage: ImageStoragePort,
    @Inject(DETAIL_PAGE_TEMPLATE_STYLES_PORT)
    private readonly templateStyles: DetailPageTemplateStylesPort,
    private readonly rasterization: DetailPageRasterizationService,
    @Optional()
    @Inject(DETAIL_PAGE_CLIENT_RENDER_CLOCK)
    private readonly now: () => Date = () => new Date(),
  ) {}

  async prepare(input: {
    organizationId: string;
    userId: string;
    contentWorkspaceId: string;
    /** 등록 대상이 고른 상세 revision(KID-321). 없으면 작업공간의 현재 revision. 이 작업공간의 것이 아니면 400. */
    detailPageRevisionId?: string | null;
  }): Promise<DetailPageClientRenderPrepareResponse> {
    const saved = await this.detailPages.findWorkspaceRevision({
      organizationId: input.organizationId,
      contentWorkspaceId: input.contentWorkspaceId,
      revisionId: input.detailPageRevisionId ?? null,
    });
    if (!saved && input.detailPageRevisionId) {
      throw new BadRequestException('고른 상세 revision 이 이 작업공간의 것이 아닙니다.');
    }
    if (!saved) {
      return {
        status: 'missing',
        reason: 'no_saved_detail_page',
        message: MISSING_MESSAGES.no_saved_detail_page,
      };
    }
    if (!saved.html.trim()) {
      return {
        status: 'missing',
        reason: 'empty_html',
        message: MISSING_MESSAGES.empty_html,
      };
    }

    const artifact = await this.images.findArtifact({
      organizationId: input.organizationId,
      revisionId: saved.id,
      variant: SERVER_RENDER_VARIANT,
      outputWidth: DETAIL_PAGE_CLIENT_RENDER_OUTPUT_WIDTH,
    });
    if (artifact) return readyArtifact(artifact);

    const currentTime = this.now();
    const renderIntent = await this.images.createIntent({
      organizationId: input.organizationId,
      detailPageId: saved.detailPageId,
      revisionId: saved.id,
      variant: SERVER_RENDER_VARIANT,
      outputWidth: DETAIL_PAGE_CLIENT_RENDER_OUTPUT_WIDTH,
      objectKey: serverObjectKey(input.organizationId, saved.id),
      requestedByUserId: input.userId,
      expiresAt: new Date(currentTime.getTime() + INTENT_TTL_MS),
    });
    const claimed = await this.images.claimIntent({
      organizationId: input.organizationId,
      intentId: renderIntent.id,
      userId: input.userId,
      claimedAt: currentTime,
    });
    if (claimed.status !== 'claimed') {
      throw new ConflictException('상세페이지 서버 렌더 작업을 시작하지 못했습니다. 다시 시도해 주세요.');
    }

    try {
      const document = buildRenderDocument(
        saved.html,
        requireWebOrigin(),
        this.templateStyles.getCompiledCss(),
      );
      const raster = await this.rasterization.render({
        html: document,
        viewportWidth: DETAIL_PAGE_CLIENT_RENDER_LAYOUT_WIDTH,
        outputWidth: DETAIL_PAGE_CLIENT_RENDER_OUTPUT_WIDTH,
        format: 'jpeg',
        quality: COUPANG_DETAIL_JPEG_QUALITY,
      });
      if (
        raster.contentType !== DETAIL_PAGE_CLIENT_RENDER_CONTENT_TYPE ||
        raster.buffer.byteLength <= 0 ||
        raster.buffer.byteLength > DETAIL_PAGE_CLIENT_RENDER_MAX_BYTES
      ) {
        throw new BadRequestException('서버에서 생성한 상세페이지 JPEG 크기가 허용 범위를 벗어났습니다.');
      }
      const metadata = await sharp(raster.buffer, { failOn: 'error' }).metadata();
      const pixelWidth = metadata.width ?? 0;
      const pixelHeight = metadata.height ?? 0;
      if (
        metadata.format !== 'jpeg' ||
        pixelWidth !== DETAIL_PAGE_CLIENT_RENDER_OUTPUT_WIDTH ||
        pixelHeight <= 0 ||
        pixelHeight > DETAIL_PAGE_CLIENT_RENDER_MAX_HEIGHT
      ) {
        throw new BadRequestException(
          `서버에서 생성한 상세페이지 JPEG 규격이 올바르지 않습니다 (${pixelWidth}x${pixelHeight}).`,
        );
      }
      const sha256 = createHash('sha256').update(raster.buffer).digest('hex');
      const imageUrl = await this.storage.save(
        renderIntent.objectKey,
        raster.buffer,
        DETAIL_PAGE_CLIENT_RENDER_CONTENT_TYPE,
      );
      const completed = await this.images.completeIntent({
        organizationId: input.organizationId,
        intentId: renderIntent.id,
        imageUrl,
        contentType: DETAIL_PAGE_CLIENT_RENDER_CONTENT_TYPE,
        byteLength: raster.buffer.byteLength,
        pixelWidth,
        pixelHeight,
        sha256,
        rendererKind: SERVER_RENDERER_KIND,
        createdByUserId: input.userId,
        completedAt: this.now(),
      });
      if (!completed) {
        throw new ConflictException('상세페이지 서버 렌더 결과를 확정하지 못했습니다. 다시 시도해 주세요.');
      }
      return readyArtifact(completed);
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 300);
      await this.images.failIntent({
        organizationId: input.organizationId,
        intentId: renderIntent.id,
        failureCode: 'server_render_failed',
        failureMessage: message || '상세페이지 서버 렌더링에 실패했습니다.',
        failedAt: this.now(),
      }).catch(() => undefined);
      throw error;
    }
  }

  async claim(input: {
    organizationId: string;
    userId: string;
    intentId: string;
  }): Promise<DetailPageClientRenderClaimResponse> {
    const currentTime = this.now();
    const current = await this.requireIntent(input.organizationId, input.intentId);
    await this.requireNotExpired(current, currentTime);
    if (current.state === 'completed') {
      throw new ConflictException('이미 완료된 상세페이지 이미지 렌더 요청입니다.');
    }

    const result = await this.images.claimIntent({
      organizationId: input.organizationId,
      intentId: input.intentId,
      userId: input.userId,
      claimedAt: currentTime,
    });
    if (result.status === 'missing') {
      throw new NotFoundException('상세페이지 이미지 렌더 요청을 찾을 수 없습니다.');
    }
    if (result.status === 'conflict') {
      throw new ConflictException('다른 브라우저가 상세페이지 이미지 렌더를 수행 중입니다.');
    }

    const claimed = result.intent;
    const upload = await this.storage.createPresignedPut({
      key: claimed.objectKey,
      contentType: DETAIL_PAGE_CLIENT_RENDER_CONTENT_TYPE,
      expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
      metadata: {
        'intent-id': claimed.id,
      },
    });
    const renderDocumentUrl = new URL('/detail-page-client-render', requireWebOrigin());
    renderDocumentUrl.searchParams.set('intentId', claimed.id);

    return {
      intentId: claimed.id,
      revisionId: claimed.revisionId,
      variant: DETAIL_PAGE_CLIENT_RENDER_VARIANT,
      outputWidth: DETAIL_PAGE_CLIENT_RENDER_OUTPUT_WIDTH,
      renderDocumentUrl: renderDocumentUrl.toString(),
      upload: {
        url: upload.uploadUrl,
        headers: upload.headers,
        expiresAt: upload.expiresAt.toISOString(),
      },
    };
  }

  async document(input: {
    organizationId: string;
    userId: string;
    intentId: string;
  }): Promise<DetailPageClientRenderDocumentResponse> {
    const renderIntent = await this.requireIntent(input.organizationId, input.intentId);
    await this.requireNotExpired(renderIntent, this.now());
    this.requireClaimant(renderIntent, input.userId);

    const revision = await this.detailPages.findRevision({
      organizationId: input.organizationId,
      revisionId: renderIntent.revisionId,
    });
    if (!revision || revision.detailPageId !== renderIntent.detailPageId || !revision.html.trim()) {
      throw new NotFoundException('렌더할 상세페이지 revision을 찾을 수 없습니다.');
    }

    return {
      intentId: renderIntent.id,
      revisionId: renderIntent.revisionId,
      html: buildRenderDocument(
        revision.html,
        requireWebOrigin(),
        this.templateStyles.getCompiledCss(),
      ),
      layoutWidth: DETAIL_PAGE_CLIENT_RENDER_LAYOUT_WIDTH,
      outputWidth: DETAIL_PAGE_CLIENT_RENDER_OUTPUT_WIDTH,
      requiredAssetPolicy: 'all',
    };
  }

  async finalize(input: {
    organizationId: string;
    userId: string;
    intentId: string;
    body: DetailPageClientRenderFinalizeBody;
  }): Promise<DetailPageClientRenderStatusResponse> {
    const renderIntent = await this.requireIntent(input.organizationId, input.intentId);
    if (renderIntent.state === 'completed' && renderIntent.completedArtifact) {
      return this.toStatus(renderIntent);
    }
    await this.requireNotExpired(renderIntent, this.now());
    this.requireClaimant(renderIntent, input.userId);

    const inspected = await this.storage.inspectJpeg({
      key: renderIntent.objectKey,
      maxByteLength: DETAIL_PAGE_CLIENT_RENDER_MAX_BYTES,
    });
    const metadataMatches = inspected.metadata['intent-id'] === renderIntent.id;
    const observationsMatch =
      inspected.contentType === DETAIL_PAGE_CLIENT_RENDER_CONTENT_TYPE &&
      inspected.sha256 === input.body.sha256 &&
      inspected.pixelWidth === DETAIL_PAGE_CLIENT_RENDER_OUTPUT_WIDTH &&
      inspected.pixelHeight > 0 &&
      inspected.pixelHeight <= DETAIL_PAGE_CLIENT_RENDER_MAX_HEIGHT;
    if (!metadataMatches || !observationsMatch) {
      throw new BadRequestException('업로드된 상세페이지 JPEG 검증값이 일치하지 않습니다.');
    }

    const artifact = await this.images.completeIntent({
      organizationId: input.organizationId,
      intentId: input.intentId,
      imageUrl: this.storage.getUrl(renderIntent.objectKey),
      contentType: inspected.contentType,
      byteLength: inspected.byteLength,
      pixelWidth: inspected.pixelWidth,
      pixelHeight: inspected.pixelHeight,
      sha256: inspected.sha256,
      rendererKind: CLIENT_RENDERER_KIND,
      createdByUserId: input.userId,
      completedAt: this.now(),
    });
    if (!artifact) {
      throw new ConflictException('상세페이지 이미지 렌더 요청을 완료할 수 없습니다.');
    }
    return this.toStatus({
      ...renderIntent,
      state: 'completed',
      completedAt: this.now(),
      completedArtifactId: artifact.id,
      completedArtifact: artifact,
    });
  }

  async fail(input: {
    organizationId: string;
    userId: string;
    intentId: string;
    body: DetailPageClientRenderFailBody;
  }): Promise<DetailPageClientRenderStatusResponse> {
    const renderIntent = await this.requireIntent(input.organizationId, input.intentId);
    if (renderIntent.state === 'completed') {
      throw new ConflictException('완료된 상세페이지 이미지 렌더 요청은 실패 처리할 수 없습니다.');
    }
    await this.requireNotExpired(renderIntent, this.now());
    this.requireClaimant(renderIntent, input.userId);
    const failed = await this.images.failIntent({
      organizationId: input.organizationId,
      intentId: input.intentId,
      failureCode: input.body.code,
      failureMessage: input.body.message,
      failedAt: this.now(),
    });
    if (!failed) throw new ConflictException('렌더 요청을 실패 처리할 수 없습니다.');
    return this.toStatus(failed);
  }

  async status(input: {
    organizationId: string;
    intentId: string;
  }): Promise<DetailPageClientRenderStatusResponse> {
    const renderIntent = await this.requireIntent(input.organizationId, input.intentId);
    if (
      ['issued', 'claimed', 'uploaded'].includes(renderIntent.state) &&
      renderIntent.expiresAt.getTime() <= this.now().getTime()
    ) {
      const expiredAt = this.now();
      await this.images.expireIntent({
        organizationId: input.organizationId,
        intentId: input.intentId,
        expiredAt,
      });
      return this.toStatus({
        ...renderIntent,
        state: 'expired',
        failedAt: expiredAt,
        failureCode: 'intent_expired',
        failureMessage: '상세페이지 이미지 렌더 요청이 만료되었습니다.',
      });
    }
    return this.toStatus(renderIntent);
  }

  private async requireIntent(
    organizationId: string,
    intentId: string,
  ): Promise<DetailPageImageRenderIntentRecord> {
    const renderIntent = await this.images.findIntent({ organizationId, intentId });
    if (!renderIntent) {
      throw new NotFoundException('상세페이지 이미지 렌더 요청을 찾을 수 없습니다.');
    }
    return renderIntent;
  }

  private async requireNotExpired(
    renderIntent: DetailPageImageRenderIntentRecord,
    currentTime: Date,
  ): Promise<void> {
    if (renderIntent.expiresAt.getTime() > currentTime.getTime()) return;
    await this.images.expireIntent({
      organizationId: renderIntent.organizationId,
      intentId: renderIntent.id,
      expiredAt: currentTime,
    });
    throw new GoneException('상세페이지 이미지 렌더 요청이 만료되었습니다.');
  }

  private requireClaimant(
    renderIntent: DetailPageImageRenderIntentRecord,
    userId: string,
  ): void {
    if (
      renderIntent.state !== 'claimed' ||
      renderIntent.claimedByUserId !== userId
    ) {
      throw new ForbiddenException('이 렌더 요청을 claim한 사용자만 접근할 수 있습니다.');
    }
  }

  private toStatus(
    renderIntent: DetailPageImageRenderIntentRecord,
  ): DetailPageClientRenderStatusResponse {
    const state = renderIntent.state as DetailPageClientRenderStatusResponse['state'];
    return {
      intentId: renderIntent.id,
      revisionId: renderIntent.revisionId,
      state,
      expiresAt: renderIntent.expiresAt.toISOString(),
      error:
        renderIntent.failureCode && renderIntent.failureMessage
          ? { code: renderIntent.failureCode, message: renderIntent.failureMessage }
          : null,
      artifact: statusArtifact(renderIntent.completedArtifact),
    };
  }
}
