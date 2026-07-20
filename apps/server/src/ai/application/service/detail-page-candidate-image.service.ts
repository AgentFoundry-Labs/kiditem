import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  DETAIL_PAGE_QUERY_REPOSITORY_PORT,
  type DetailPageQueryRepositoryPort,
} from '../port/out/repository/detail-page-query.repository.port';
import {
  IMAGE_STORAGE_PORT,
  type ImageStoragePort,
} from '../port/out/storage/image-storage.port';
import {
  DETAIL_PAGE_TEMPLATE_STYLES_PORT,
  type DetailPageTemplateStylesPort,
} from '../port/out/runtime/detail-page-template-styles.port';
import { DetailPageRasterizationService } from './detail-page-rasterization.service';

/**
 * 저장된 상세페이지 HTML → 마켓 상세설명용 "긴 이미지 한 장".
 *
 * 쿠팡 상세설명은 섹션 이미지 낱장 묶음이 아니라 세로로 긴 이미지 1장이다.
 * 저장 HTML 안의 내부 자산 URL 을 그대로 WING 에 넘기면 구매자 화면에서 깨진다.
 * 그래서 먼저 전체 페이지를 이미지 1장으로 렌더링한다. 확장은 이 파일을 쿠팡 CDN 에
 * 올린 뒤, 발급된 vendor_inventory URL 을 WING `HTML 작성` 탭의 <img> 로 저장한다.
 */

/** 쿠팡 권장 상세설명 폭. 760=쿠팡, 800=11번가, 860=네이버/G마켓. */
export const COUPANG_DETAIL_IMAGE_WIDTH = 780;
/** 에디터 미리보기·다운로드와 동일한 상세페이지 레이아웃 폭. */
export const COUPANG_DETAIL_LAYOUT_WIDTH = 720;
/** 긴 상세페이지의 사진·작은 문구를 보존하면서 전송량을 줄이는 JPEG 품질. */
export const COUPANG_DETAIL_JPEG_QUALITY = 82;

export type CandidateDetailImageMissingReason = 'no_saved_detail_page' | 'empty_html';

export type CandidateDetailImageResult =
  | {
      status: 'rendered';
      imageUrl: string;
      outputWidth: number;
      contentType: string;
      byteLength: number;
      revisionId: string;
      artifactId: string;
    }
  | {
      status: 'missing';
      reason: CandidateDetailImageMissingReason;
      message: string;
    };

const MISSING_MESSAGES: Record<CandidateDetailImageMissingReason, string> = {
  no_saved_detail_page:
    '저장된 상세페이지가 없습니다. 상세페이지를 생성하고 저장한 뒤 다시 시도하세요.',
  empty_html: '저장된 상세페이지 HTML 이 비어 있습니다. 상세페이지를 다시 저장하세요.',
};

function missing(reason: CandidateDetailImageMissingReason): CandidateDetailImageResult {
  return { status: 'missing', reason, message: MISSING_MESSAGES[reason] };
}

function serverOrigin(): string {
  const port = Number(process.env.PORT) || 4000;
  return `http://localhost:${port}`;
}

/**
 * 렌더 문서의 최소 reset. 이미지의 폭·높이는 canonical template CSS와 저장된 편집
 * 스타일이 결정해야 한다. 여기서 `height:auto !important`를 강제하면 hero crop과
 * 고정 높이 카드가 프런트 다운로드와 달라진다.
 */
const RENDER_RESET_CSS = `
  html, body { margin: 0; padding: 0; }

  /*
   * Older GrapesJS revisions flattened this frame to transparent inline
   * styles. The web preview repairs it before display; mirror that repair so
   * server-side marketplace captures render the same saved design.
   */
  [data-role="package-image-frame"] {
    overflow: hidden !important;
    border-radius: 34px !important;
    border: 1px solid #d8ebf7 !important;
    background: #eaf6ff !important;
    padding: 40px !important;
  }
  [data-role="package-image-frame"] img {
    display: block !important;
    width: 100% !important;
    height: auto !important;
    object-fit: contain !important;
    border-radius: 24px !important;
    mix-blend-mode: multiply !important;
  }
`;

const TEMPLATE_STYLE_ATTR = 'data-kiditem-template-styles';

function hasCompiledTemplateStyles(html: string): boolean {
  return new RegExp(`<style[^>]+${TEMPLATE_STYLE_ATTR}`, 'i').test(html)
    || /tailwindcss\s+v\d/i.test(html);
}

function escapeStyleText(css: string): string {
  return css.replace(/<\/style/gi, '<\\/style');
}

/**
 * 저장 HTML 을 렌더 문서로 감싼다.
 * 상대 경로 자산이 about:blank 기준으로 깨지지 않도록 서버 오리진 `<base>` 를 넣고,
 * 미리보기 환경이 제공하던 이미지 폭 제약(`RENDER_RESET_CSS`)을 함께 넣는다.
 * (웹의 `buildServerRenderHtml` 과 같은 역할)
 */
export function buildRenderDocument(
  html: string,
  baseHref: string,
  compiledTemplateCss: string,
): string {
  const reset = `<style>${RENDER_RESET_CSS}</style>`;
  const templateStyles = hasCompiledTemplateStyles(html)
    ? ''
    : `<style ${TEMPLATE_STYLE_ATTR}>${escapeStyleText(compiledTemplateCss)}</style>`;
  // `<base>` 가 이미 있어도 리셋은 넣어야 한다 — 높이 부풀림의 원인은 base 가 아니라 CSS 다.
  const base = /<base\s/i.test(html) ? '' : `<base href="${baseHref}/" />`;
  if (/<head(\s[^>]*)?>/i.test(html)) {
    return html.replace(
      /<head(\s[^>]*)?>/i,
      (match) => `${match}\n${base}\n${templateStyles}\n${reset}`,
    );
  }
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  ${base}
  ${templateStyles}
  ${reset}
</head>
<body>${html}</body>
</html>`;
}

@Injectable()
export class DetailPageCandidateImageService {
  private readonly logger = new Logger(DetailPageCandidateImageService.name);

  constructor(
    @Inject(DETAIL_PAGE_QUERY_REPOSITORY_PORT)
    private readonly detailPages: DetailPageQueryRepositoryPort,
    private readonly rasterization: DetailPageRasterizationService,
    @Inject(IMAGE_STORAGE_PORT)
    private readonly storage: ImageStoragePort,
    @Inject(DETAIL_PAGE_TEMPLATE_STYLES_PORT)
    private readonly templateStyles: DetailPageTemplateStylesPort,
  ) {}

  /**
   * 후보의 저장된 상세페이지를 `outputWidth` px 짜리 이미지 1장으로 래스터라이즈해
   * 스토리지에 올리고 URL 을 돌려준다.
   *
   * 상세페이지가 없으면 예외가 아니라 `status: 'missing'` 을 돌려준다. 호출자가
   * 대표이미지 같은 다른 이미지로 조용히 대체하지 못하게 하려는 의도적 계약이다.
   */
  async renderCandidateDetailImage(input: {
    organizationId: string;
    sourceCandidateId: string;
    outputWidth?: number;
  }): Promise<CandidateDetailImageResult> {
    const outputWidth = input.outputWidth ?? COUPANG_DETAIL_IMAGE_WIDTH;
    const saved = await this.detailPages.findCandidateCurrentDetailPageHtml({
      sourceCandidateId: input.sourceCandidateId,
      organizationId: input.organizationId,
    });
    if (!saved) return missing('no_saved_detail_page');
    if (!saved.html.trim()) return missing('empty_html');

    const viewportWidth = COUPANG_DETAIL_LAYOUT_WIDTH;
    const rendered = await this.rasterization.render({
      html: buildRenderDocument(
        saved.html,
        serverOrigin(),
        this.templateStyles.getCompiledCss(),
      ),
      viewportWidth,
      outputWidth,
      format: 'jpeg',
      quality: COUPANG_DETAIL_JPEG_QUALITY,
    });

    const key = `detail-page-images/${input.organizationId}/${saved.revisionId}/${randomUUID()}.jpg`;
    const imageUrl = await this.storage.save(key, rendered.buffer, rendered.contentType);
    this.logger.log(
      `Rendered candidate ${input.sourceCandidateId} detail page `
      + `(revision ${saved.revisionId}, ${viewportWidth}px -> ${outputWidth}px, `
      + `${rendered.buffer.byteLength} bytes)`,
    );

    return {
      status: 'rendered',
      imageUrl,
      outputWidth,
      contentType: rendered.contentType,
      byteLength: rendered.buffer.byteLength,
      revisionId: saved.revisionId,
      artifactId: saved.artifactId,
    };
  }
}
