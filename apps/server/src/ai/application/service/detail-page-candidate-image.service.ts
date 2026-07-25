import { Inject, Injectable } from '@nestjs/common';
import type { DetailPageRasterJobOutput } from '../../domain/direct-job/detail-page-raster-job';
import {
  DETAIL_PAGE_QUERY_REPOSITORY_PORT,
  type DetailPageQueryRepositoryPort,
} from '../port/out/repository/detail-page-query.repository.port';
import {
  COUPANG_DETAIL_IMAGE_WIDTH,
} from './detail-page-render-document';
import { DetailPageRasterJobService } from './detail-page-raster-job.service';

export {
  buildRenderDocument,
  COUPANG_DETAIL_IMAGE_WIDTH,
  COUPANG_DETAIL_JPEG_QUALITY,
  COUPANG_DETAIL_LAYOUT_WIDTH,
} from './detail-page-render-document';

export type CandidateDetailImageMissingReason =
  | 'no_saved_detail_page'
  | 'empty_html';

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
      status: 'processing';
      revisionId: string;
      artifactId: string;
      message: string;
    }
  | {
      status: 'failed';
      revisionId: string;
      artifactId: string;
      message: string;
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

const PROCESSING_MESSAGE =
  '저장된 상세페이지 이미지를 준비하고 있습니다. 완료되면 등록을 계속합니다.';

function missing(
  reason: CandidateDetailImageMissingReason,
): CandidateDetailImageResult {
  return { status: 'missing', reason, message: MISSING_MESSAGES[reason] };
}

function rendered(output: DetailPageRasterJobOutput): CandidateDetailImageResult {
  return { status: 'rendered', ...output };
}

/**
 * Reads or schedules the cached marketplace rendition for a candidate's saved
 * detail-page revision. This request never launches Chromium; Puppeteer runs
 * only inside the durable direct-job worker.
 */
@Injectable()
export class DetailPageCandidateImageService {
  constructor(
    @Inject(DETAIL_PAGE_QUERY_REPOSITORY_PORT)
    private readonly detailPages: DetailPageQueryRepositoryPort,
    private readonly rasterJobs: DetailPageRasterJobService,
  ) {}

  async renderCandidateDetailImage(input: {
    organizationId: string;
    sourceCandidateId: string;
    outputWidth?: number;
    retryFailed?: boolean;
  }): Promise<CandidateDetailImageResult> {
    const outputWidth = input.outputWidth ?? COUPANG_DETAIL_IMAGE_WIDTH;
    const saved = await this.detailPages.findCandidateCurrentDetailPageHtml({
      sourceCandidateId: input.sourceCandidateId,
      organizationId: input.organizationId,
    });
    if (!saved) return missing('no_saved_detail_page');
    if (!saved.html.trim()) return missing('empty_html');

    const status = await this.rasterJobs.statusForRevision({
      organizationId: input.organizationId,
      revisionId: saved.revisionId,
      outputWidth,
    });
    if (status.status === 'rendered') return rendered(status.output);
    if (status.status === 'processing') {
      return {
        status: 'processing',
        revisionId: saved.revisionId,
        artifactId: saved.artifactId,
        message: PROCESSING_MESSAGE,
      };
    }
    if (status.status === 'failed' && input.retryFailed !== true) {
      return {
        status: 'failed',
        revisionId: saved.revisionId,
        artifactId: saved.artifactId,
        message: status.message,
      };
    }

    const scheduled = await this.rasterJobs.ensureScheduled({
      organizationId: input.organizationId,
      revisionId: saved.revisionId,
      artifactId: saved.artifactId,
      outputWidth,
    });
    if (scheduled.status === 'rendered') return rendered(scheduled.output);
    if (scheduled.status === 'failed') {
      return {
        status: 'failed',
        revisionId: saved.revisionId,
        artifactId: saved.artifactId,
        message: scheduled.message,
      };
    }
    return {
      status: 'processing',
      revisionId: saved.revisionId,
      artifactId: saved.artifactId,
      message: PROCESSING_MESSAGE,
    };
  }
}
