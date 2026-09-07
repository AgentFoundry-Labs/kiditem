import type {
  MallAdapterManifestView,
  MallPreflightRule,
  MallPublishTarget,
} from '@kiditem/shared/mall-publishing';

export const MALL_READINESS_LABEL: Record<MallPublishTarget['readiness'], string> = {
  ready: '송신 준비됨',
  needs_profile: '프로필 필요',
  needs_promotion: '계정 연결 필요',
  needs_account: '계정 정보 필요',
  unsupported: '경로 미확인',
};

export const MALL_READINESS_TONE: Record<MallPublishTarget['readiness'], string> = {
  ready: 'bg-emerald-500',
  needs_profile: 'bg-amber-400',
  needs_promotion: 'bg-amber-400',
  needs_account: 'bg-slate-300',
  unsupported: 'bg-slate-200',
};

export const MALL_KIND_LABEL: Record<MallAdapterManifestView['kind'], string> = {
  api: '공식 API',
  extension_form: '어드민 폼',
  extension_excel: '엑셀',
  unknown: '미확인',
};

export const PREFLIGHT_RULE_LABEL: Record<MallPreflightRule, string> = {
  mall_category_mapped: '카테고리 매핑',
  notice_attributes: '상품정보고시',
  kc_certification: 'KC 인증',
  kc_not_expired: 'KC 유효기간',
  images_present: '이미지',
  price_positive: '판매가',
  option_name_forbids_danpum: '옵션명 규칙',
  charset_korean_english_only: '문자 규칙',
  option_count_within_limit: '옵션 수 상한',
  profile_selected: '송신 프로필',
};

export interface MallHazardBadge {
  label: string;
  detail: string;
  tone: 'danger' | 'warn';
}

/**
 * 매니페스트의 위험 플래그를 화면 뱃지로 편다.
 *
 * 사방넷은 이 정보를 [쇼핑몰특이사항] 팝업 안에만 뒀다. 몰 카드에 상시로 붙여
 * 두면 운영자가 외우지 않아도 된다.
 */
export function mallHazardBadges(manifest: MallAdapterManifestView): MallHazardBadge[] {
  const badges: MallHazardBadge[] = [];
  const { hazards, limits } = manifest;

  if (hazards.soldOutDeletesListing) {
    badges.push({
      label: '완전품절 = 삭제',
      detail: '이 몰에서 완전품절은 리스팅 영구삭제입니다. 품절 명령은 판매중지로 강등해서 보냅니다.',
      tone: 'danger',
    });
  }
  if (hazards.irreversibleStates.length > 0) {
    badges.push({
      label: `비가역 상태 ${hazards.irreversibleStates.join('·')}`,
      detail: '한 번 들어가면 되돌릴 수 없어 자동화에서 차단합니다.',
      tone: 'danger',
    });
  }
  if (hazards.suspendAutoDeletesAfterDays !== null) {
    badges.push({
      label: `판매중지 ${hazards.suspendAutoDeletesAfterDays}일 후 삭제`,
      detail: '판매중지 상태를 오래 두면 몰이 리스팅을 자동 삭제합니다.',
      tone: 'danger',
    });
  }
  if (hazards.updateResetsApproval) {
    badges.push({
      label: '수정 = 재승인',
      detail: '정보 수정이 미승인·판매중지·미노출로 역행합니다. 판매상태 단독 변경 경로를 써야 합니다.',
      tone: 'warn',
    });
  }
  if (hazards.fullPayloadOnUpdate) {
    badges.push({
      label: '전체 재전송',
      detail: '수정 시 전체 필드를 다시 보내야 합니다. 누락한 필드는 삭제됩니다.',
      tone: 'warn',
    });
  }
  if (hazards.stockWriteOverwritesPrice) {
    badges.push({
      label: '재고 송신이 판매가 덮어씀',
      detail: '재고만 보내도 판매가가 바뀝니다. 현재가를 함께 읽어 보존 전송합니다.',
      tone: 'warn',
    });
  }
  if (hazards.requiresOperatorApproval) {
    badges.push({
      label: '관리자 승인 필요',
      detail: '송신이 곧 반영이 아니라 몰 관리자에게 요청이 갑니다. 즉시 반영이 보장되지 않습니다.',
      tone: 'warn',
    });
  }
  if (hazards.resumeRequiresAlternatePath) {
    badges.push({
      label: '해제 경로 다름',
      detail: '품절과 해제가 같은 화면에서 대칭이 아닙니다. 해제는 다른 경로로 보냅니다.',
      tone: 'warn',
    });
  }
  if (limits.minStockValue !== null && limits.minStockValue > 0) {
    badges.push({
      label: `재고 최소 ${limits.minStockValue}`,
      detail: '재고를 0으로 만들 수 없어 품절을 재고축으로 표현할 수 없습니다.',
      tone: 'warn',
    });
  }
  if (limits.ratePerSecond !== null) {
    badges.push({
      label: `${limits.ratePerSecond}건/초`,
      detail: '몰이 정한 호출 상한입니다.',
      tone: 'warn',
    });
  }
  return badges;
}
