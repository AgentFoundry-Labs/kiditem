import type { DetailPageRow } from './detail-page.repository.port';
import type {
  DetailPageRawInput,
  DetailPageTemplateId,
} from '../../../service/detail-page-ai.types';
import type { ProductGenerationChildIdentity } from '../../../service/product-generation-child-identity';
import type { CreateAiDirectJobInput } from './ai-direct-job.repository.port';

export const DETAIL_PAGE_GENERATION_REPOSITORY_PORT = Symbol(
  'DETAIL_PAGE_GENERATION_REPOSITORY_PORT',
);

/**
 * AI 상세 생성의 저장소 계약(KID-313 W3b). 생성 하나 = `source: 'generated'` 상세 페이지 하나이고, 그 id 가 direct
 * job 의 `sourceResourceId` 다. 생성 입력 사진은 워크스페이스 자산(`detail_source`)으로, 출처(원본 기록 id ·
 * 기반 상세 페이지 id · 입력 자산 id)는 `generation_input` 에 남는다.
 */

export interface DetailPageContentWorkspaceSnapshot {
  id: string;
  salesProductId: string | null;
}

export interface DetailPageSourcePageSnapshot {
  id: string;
  title: string | null;
}

export interface DetailPageSourceContentAssetSnapshot {
  id: string;
  label: string | null;
  role: string | null;
}

export interface DetailPageImageOnlyBaseCandidateSnapshot {
  id: string;
  generationInput: unknown;
  generationResult: unknown;
  templateId: string | null;
}

export interface DetailPageDirectGenerationCancellation {
  status: 'cancelled' | 'already_terminal' | 'not_found';
  generationId: string;
  preserved: boolean;
}

export type DetailPageOpenGenerationResult = {
  status: 'created' | 'existing';
  page: DetailPageRow;
  directJobId: string;
  releaseRequired: boolean;
};

export interface DetailPageGenerationRepositoryPort {
  findActiveContentWorkspace(input: {
    organizationId: string;
    contentWorkspaceId: string;
  }): Promise<DetailPageContentWorkspaceSnapshot | null>;
  /**
   * 생성 페이지(`pending`) · 입력 사진 자산 · held direct job 을 한 트랜잭션에서 연다. 상품 생성의 결정적 id 가
   * 이미 있으면 같은 요청(hash)일 때 그것을 돌려주고, 다르면 Conflict.
   */
  openGeneration(input: {
    organizationId: string;
    contentWorkspaceId: string;
    triggeredByUserId: string | null;
    templateId: DetailPageTemplateId;
    rawInput: DetailPageRawInput;
    imageUrls: string[];
    title: string;
    productGenerationIdentity?: ProductGenerationChildIdentity;
    directJob: Omit<CreateAiDirectJobInput, 'organizationId' | 'sourceResourceId'>;
  }): Promise<DetailPageOpenGenerationResult>;
  /** 같은 워크스페이스 · 템플릿의 결과가 있는 최근 생성(이미지만 다시 만들기의 기반). */
  findImageOnlyBaseCandidates(input: {
    organizationId: string;
    contentWorkspaceId: string;
    templateId: DetailPageTemplateId;
  }): Promise<DetailPageImageOnlyBaseCandidateSnapshot[]>;
  findSourceDetailPage(input: {
    organizationId: string;
    detailPageId: string;
  }): Promise<DetailPageSourcePageSnapshot | null>;
  findSourceContentAsset(input: {
    organizationId: string;
    contentAssetId: string;
  }): Promise<DetailPageSourceContentAssetSnapshot | null>;
  /** direct job 이 아직 돌 수 있는가(pending · processing). 없으면 null. */
  findGenerationStatus(input: {
    organizationId: string;
    detailPageId: string;
  }): Promise<{ id: string; status: string } | null>;
  /** 진행 중인 생성을 `failed`(사유 = 취소 메시지)로 닫고 그 job 을 취소한다. 끝난 생성은 그대로. */
  cancelDirectGeneration(input: {
    organizationId: string;
    detailPageId: string;
    reason: string;
  }): Promise<DetailPageDirectGenerationCancellation>;
}
