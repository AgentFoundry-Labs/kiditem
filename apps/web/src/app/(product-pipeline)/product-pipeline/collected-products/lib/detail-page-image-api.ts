import { apiClient } from '@/lib/api-client';

/**
 * 저장된 상세페이지 → 마켓 상세설명용 "긴 이미지 한 장" 렌더 API.
 *
 * 쿠팡 상세설명은 섹션 이미지 낱장 묶음이 아니라 세로로 긴 이미지 1장이다.
 * 서버가 저장된 상세페이지 HTML 을 요청 폭으로 래스터라이즈해 스토리지에 올리고
 * URL 을 돌려준다. 확장은 그 URL 을 직접 fetch 해서 쿠팡 상세설명 모달에 드롭한다.
 */

/** 쿠팡 권장 상세설명 폭. 760=쿠팡, 800=11번가, 860=네이버/G마켓. */
export const COUPANG_DETAIL_IMAGE_WIDTH = 780;

export type CandidateDetailImageMissingReason = 'no_saved_detail_page' | 'empty_html';

export type CandidateDetailImageResponse =
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

/**
 * 상세페이지가 없으면 예외가 아니라 `status: 'missing'` 이 온다.
 * 호출자가 대표이미지 같은 다른 이미지로 조용히 대체하지 못하게 하려는 서버 계약이다.
 */
export function renderCandidateDetailImage(
  candidateId: string,
  outputWidth: number = COUPANG_DETAIL_IMAGE_WIDTH,
): Promise<CandidateDetailImageResponse> {
  return apiClient.post<CandidateDetailImageResponse>(
    `/api/ai/detail-page-image/candidate/${candidateId}`,
    { outputWidth },
  );
}
