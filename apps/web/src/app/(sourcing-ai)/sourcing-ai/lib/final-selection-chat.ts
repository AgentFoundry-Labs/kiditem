export function buildFinalSelectionAgentResponse(message: string, context: {
  totalCandidates: number;
  selectedCount: number;
  criterionCount: number;
}): string {
  const normalized = message.replace(/\s+/g, '').toLowerCase();

  if (normalized.includes('1688') || normalized.includes('매칭')) {
    return '1688 매칭은 선택한 쿠팡 상품 이미지와 관심 키워드를 같이 넘기는 구조로 붙이면 됩니다. 다음 단계에서 가격, 배송, 거래처 점수를 모델이 같이 보게 만들면 돼요.';
  }

  if (normalized.includes('기준') || normalized.includes('필터')) {
    return `현재 소싱 설정 ${context.criterionCount}개와 상품 후보 ${context.totalCandidates}개를 기준으로 볼 수 있어요. 이후에는 상품 소싱 기준 모델이 자동으로 제외/우선순위를 판단하게 연결하면 됩니다.`;
  }

  if (normalized.includes('선택') || normalized.includes('소싱') || normalized.includes('발주')) {
    return `지금 선택된 상품은 ${context.selectedCount}개입니다. 선택 묶음을 발주 에이전트로 넘기는 플로우로 이어가면 됩니다.`;
  }

  return '좋아요. 왼쪽에서 상품을 선택하고, 나는 오른쪽에서 왜 이 상품을 남길지/뺄지 기준을 설명하는 역할로 두면 됩니다.';
}
