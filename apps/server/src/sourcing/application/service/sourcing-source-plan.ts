/**
 * 원천 plan JSON: 원천마다 자기 얼린 대상 모양을 가진다(옛 attempt plan). 원천 키 `source`만 공통이다.
 * 확장 kind 매퍼(1688 인기상품·라이브·TikTok)와 서버 구동 kind가 실행 plan에 펼쳐 싣는다.
 */
export interface SourcingSourcePlan {
  source: string;
  [key: string]: unknown;
}
