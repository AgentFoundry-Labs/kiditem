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
  DETAIL_PAGE_QUERY_REPOSITORY_PORT,
  type DetailPageQueryRepositoryPort,
} from '../port/out/repository/detail-page-query.repository.port';
import {
  DETAIL_PAGE_TEMPLATE_STYLES_PORT,
  type DetailPageTemplateStylesPort,
} from '../port/out/runtime/detail-page-template-styles.port';
import {
  IMAGE_STORAGE_PORT,
  type ImageStoragePort,
} from '../port/out/storage/image-storage.port';
import { requireWebOrigin } from '../../../common/config/web-origin';
import { buildRenderDocument } from './detail-page-render-document';

const INTENT_TTL_MS = 15 * 60_000;
const UPLOAD_URL_TTL_SECONDS = 5 * 60;
const RENDERER_KIND = 'chrome-extension-cdp';
export const DETAIL_PAGE_CLIENT_RENDER_CLOCK = Symbol(
  'DETAIL_PAGE_CLIENT_RENDER_CLOCK',
);

const MISSING_MESSAGES = {
  no_saved_detail_page:
    '저장된 상세페이지가 없습니다. 상세페이지를 생성하고 저장한 뒤 다시 시도하세요.',
  empty_html: '저장된 상세페이지 HTML 이 비어 있습니다. 상세페이지를 다시 저장하세요.',
} as const;

function objectKey(organizationId: string, revisionId: string): string {
  return [
    'detail-page-images',
    organizationId,
    revisionId,
    `${DETAIL_PAGE_CLIENT_RENDER_VARIANT}-${DETAIL_PAGE_CLIENT_RENDER_OUTPUT_WIDTH}.jpg`,
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
    @Inject(DETAIL_PAGE_QUERY_REPOSITORY_PORT)
    private readonly detailPages: DetailPageQueryRepositoryPort,
    @Inject(DETAIL_PAGE_IMAGE_REPOSITORY_PORT)
    private readonly images: DetailPageImageRepositoryPort,
    @Inject(IMAGE_STORAGE_PORT)
    private readonly storage: ImageStoragePort,
    @Inject(DETAIL_PAGE_TEMPLATE_STYLES_PORT)
    private readonly templateStyles: DetailPageTemplateStylesPort,
    @Optional()
    @Inject(DETAIL_PAGE_CLIENT_RENDER_CLOCK)
    private readonly now: () => Date = () => new Date(),
  ) {}

  async prepare(input: {
    organizationId: string;
    userId: string;
    sourceCandidateId: string;
  }): Promise<DetailPageClientRenderPrepareResponse> {
    const saved = await this.detailPages.findCandidateCurrentDetailPageHtml({
      organizationId: input.organizationId,
      sourceCandidateId: input.sourceCandidateId,
    });
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
      revisionId: saved.revisionId,
      variant: DETAIL_PAGE_CLIENT_RENDER_VARIANT,
      outputWidth: DETAIL_PAGE_CLIENT_RENDER_OUTPUT_WIDTH,
    });
    if (artifact) return readyArtifact(artifact);

    const currentTime = this.now();
    const active = await this.images.findActiveIntent({
      organizationId: input.organizationId,
      sourceCandidateId: input.sourceCandidateId,
      revisionId: saved.revisionId,
      variant: DETAIL_PAGE_CLIENT_RENDER_VARIANT,
      outputWidth: DETAIL_PAGE_CLIENT_RENDER_OUTPUT_WIDTH,
      now: currentTime,
    });
    const renderIntent =
      active ??
      (await this.images.createIntent({
        organizationId: input.organizationId,
        sourceCandidateId: input.sourceCandidateId,
        detailPageArtifactId: saved.artifactId,
        revisionId: saved.revisionId,
        variant: DETAIL_PAGE_CLIENT_RENDER_VARIANT,
        outputWidth: DETAIL_PAGE_CLIENT_RENDER_OUTPUT_WIDTH,
        objectKey: objectKey(input.organizationId, saved.revisionId),
        requestedByUserId: input.userId,
        expiresAt: new Date(currentTime.getTime() + INTENT_TTL_MS),
      }));

    return {
      status: 'render_required',
      intentId: renderIntent.id,
      revisionId: renderIntent.revisionId,
      outputWidth: DETAIL_PAGE_CLIENT_RENDER_OUTPUT_WIDTH,
      expiresAt: renderIntent.expiresAt.toISOString(),
    };
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
        'revision-id': claimed.revisionId,
        variant: DETAIL_PAGE_CLIENT_RENDER_VARIANT,
        'output-width': String(DETAIL_PAGE_CLIENT_RENDER_OUTPUT_WIDTH),
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

    const revision = await this.detailPages.findDetailPageRevisionHtml({
      organizationId: input.organizationId,
      revisionId: renderIntent.revisionId,
      artifactId: renderIntent.detailPageArtifactId,
    });
    if (!revision || !revision.html.trim()) {
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
    const expectedMetadata = {
      'intent-id': renderIntent.id,
      'revision-id': renderIntent.revisionId,
      variant: DETAIL_PAGE_CLIENT_RENDER_VARIANT,
      'output-width': String(DETAIL_PAGE_CLIENT_RENDER_OUTPUT_WIDTH),
    };
    const metadataMatches = Object.entries(expectedMetadata).every(
      ([key, value]) => inspected.metadata[key] === value,
    );
    const observationsMatch =
      inspected.contentType === DETAIL_PAGE_CLIENT_RENDER_CONTENT_TYPE &&
      inspected.byteLength === input.body.byteLength &&
      inspected.pixelWidth === input.body.pixelWidth &&
      inspected.pixelHeight === input.body.pixelHeight &&
      inspected.sha256 === input.body.sha256 &&
      inspected.pixelWidth === DETAIL_PAGE_CLIENT_RENDER_OUTPUT_WIDTH &&
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
      rendererKind: RENDERER_KIND,
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
