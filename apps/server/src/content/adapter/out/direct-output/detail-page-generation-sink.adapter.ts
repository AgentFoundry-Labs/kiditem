import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { ownerTransactionClient } from '../../../../prisma/owner-transaction';
import type { DetailPageDirectOutputSinkPort } from '../../../application/port/out/sink/detail-page-direct-output-sink.port';
import {
  DETAIL_PAGE_REPOSITORY_PORT,
  type DetailPageRepositoryPort,
} from '../../../application/port/out/repository/detail-page.repository.port';
import type { DetailPageGenerateDirectOutput } from '../../../domain/direct-generation';
import { recordDetailPageAssets } from '../repository/detail-page-assets';

const RUNNABLE = new Set(['pending', 'processing']);

/**
 * AI 상세 생성의 결과를 그 생성 페이지(`detail_pages`, `source: 'generated'`)에 적는 sink(KID-313 W3b).
 *
 * 한 트랜잭션에서 `pending → processing → ready` 로 옮기며 결과(`generation_result`) · 제목을 적고, AI 가 만든
 * 사진을 워크스페이스 자산(`detail_image`)으로 남긴다. 결과 없이 상태만 바꾸는 길은 없다. revision 은 만들지
 * 않는다 — HTML 은 웹 템플릿이 이 결과로 그리고, 처음 저장할 때 `generated` revision 이 된다.
 *
 * 조직 범위: 모든 읽기 · 쓰기가 `{ id, organizationId }` 로 간다. 이미 끝난(ready · failed — 취소 포함) 페이지는
 * 건드리지 않는다(재시도 job · 늦은 결과는 no-op).
 */
@Injectable()
export class DetailPageGenerationSinkAdapter implements DetailPageDirectOutputSinkPort {
  private readonly logger = new Logger(DetailPageGenerationSinkAdapter.name);

  constructor(
    @Inject(DETAIL_PAGE_REPOSITORY_PORT)
    private readonly detailPages: DetailPageRepositoryPort,
  ) {}

  async applySuccess(input: {
    organizationId: string;
    requestId: string;
    runId: string | undefined;
    sourceResourceId: string | null;
    output: DetailPageGenerateDirectOutput;
  }): Promise<void> {
    if (!input.sourceResourceId) {
      this.logger.warn(`detail_page_generate success without sourceResourceId (request=${input.requestId}); cannot apply.`);
      return;
    }
    const page = await this.detailPages.findById({ organizationId: input.organizationId, detailPageId: input.sourceResourceId });
    if (!page || page.source !== 'generated') {
      this.logger.warn(`detail_page_generate success: detail page ${input.sourceResourceId} not found in organization ${input.organizationId}.`);
      return;
    }
    if (!RUNNABLE.has(page.status)) {
      this.logger.debug(`detail_page_generate success: detail page ${page.id} already ${page.status}; no-op.`);
      return;
    }

    const rawTitle = typeof page.generationInput.rawTitle === 'string' ? page.generationInput.rawTitle : null;
    const title = pickProductName(input.output.result, input.output.templateId, rawTitle ?? page.title ?? '상세페이지');
    const processedImages = input.output.processedImages ?? {};
    const applied = await this.detailPages.runInTransaction(async (transaction) => {
      try {
        if (page.status === 'pending') {
          await this.detailPages.setStatus(transaction, {
            organizationId: input.organizationId, detailPageId: page.id, status: 'processing',
          });
        }
        await this.detailPages.completeGeneration(transaction, {
          organizationId: input.organizationId,
          detailPageId: page.id,
          title,
          generationResult: {
            templateId: input.output.templateId,
            result: input.output.result,
            imageUrls: input.output.imageUrls,
            processedImages,
          },
        });
      } catch (error) {
        // 확인과 잠금 사이에 취소 · 다른 결과가 먼저 끝냈다.
        if (error instanceof ConflictException) return false;
        throw error;
      }
      await recordDetailPageAssets(ownerTransactionClient(transaction), {
        organizationId: input.organizationId,
        contentWorkspaceId: page.contentWorkspaceId,
        detailPageId: page.id,
        createdByUserId: null,
        role: 'detail_image',
        images: Object.entries(processedImages)
          .filter(([slot, url]) => slot.trim().length > 0 && url.trim().length > 0)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([slot, url]) => ({ url, label: slot })),
      });
      return true;
    });
    if (!applied) {
      this.logger.debug(`detail_page_generate success: detail page ${page.id} became terminal before apply; no-op.`);
      return;
    }
    this.logger.log(`detail_page_generate applied success → detail page ${page.id} ready (request=${input.requestId}).`);
  }

  async applyFailure(input: {
    organizationId: string;
    requestId: string;
    runId: string | undefined;
    sourceResourceId: string | null;
    errorCode: string;
    errorMessage: string;
  }): Promise<void> {
    if (!input.sourceResourceId) {
      this.logger.warn(`detail_page_generate failure without sourceResourceId (request=${input.requestId}); cannot apply.`);
      return;
    }
    const page = await this.detailPages.findById({ organizationId: input.organizationId, detailPageId: input.sourceResourceId });
    if (!page || !RUNNABLE.has(page.status)) {
      this.logger.debug(`detail_page_generate failure: detail page ${input.sourceResourceId} missing or already terminal; no-op.`);
      return;
    }
    const failed = await this.detailPages.runInTransaction(async (transaction) => {
      try {
        await this.detailPages.setStatus(transaction, {
          organizationId: input.organizationId,
          detailPageId: page.id,
          status: 'failed',
          errorMessage: input.errorMessage,
        });
        return true;
      } catch (error) {
        if (error instanceof ConflictException) return false;
        throw error;
      }
    });
    if (failed) {
      this.logger.log(`detail_page_generate applied failure → detail page ${page.id} failed (code=${input.errorCode} request=${input.requestId}).`);
    }
  }
}

function pickProductName(
  parsed: unknown,
  templateId: 'kids-playful' | 'bold-vertical',
  fallback: string,
): string {
  if (templateId === 'bold-vertical') {
    const hookText = (parsed as { hook?: { text?: unknown } }).hook?.text;
    const hookTitleSub = (parsed as { hook?: { titleSub?: unknown } }).hook?.titleSub;
    const title = [
      typeof hookText === 'string' ? hookText.trim() : '',
      typeof hookTitleSub === 'string' ? hookTitleSub.trim() : '',
    ].filter(Boolean).join(' ');
    return title || fallback.slice(0, 50);
  }
  const headline = (parsed as { section1?: { mainHeadline?: unknown } }).section1?.mainHeadline;
  return typeof headline === 'string' && headline.trim() ? headline.trim() : fallback.slice(0, 50);
}
