import { searchNaverRelatedKeywords } from '../../recommendations/lib/naver-keyword-api';

export async function refreshKeywordCandidates() {
  return searchNaverRelatedKeywords({ seedKeywords: ['슬라임'] });
}
