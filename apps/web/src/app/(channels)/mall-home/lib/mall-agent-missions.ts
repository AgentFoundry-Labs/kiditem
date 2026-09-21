import type { CapabilityKey, CapabilityTotals } from '../../_shared/mall-capabilities';

/**
 * 쇼핑몰 에이전트의 미션.
 *
 * 1~4번은 사장님이 준 미션(2026-09-11)이고, 5번부터는 에이전트가 더한 제안이다 — 화면에
 * 누가 준 미션인지 함께 적는다. 사장님이 더 적어 주면 여기에 늘린다.
 *
 * 상태는 **지금 코드가 실제로 하는 일** 기준이다. 되는 것처럼 보이게 칠하지 않는다.
 * 숫자가 들어가는 미션(되는 일 넷 · 주문 · 품절)은 쇼핑몰 현황과 같은 판정에서 읽는다.
 */
export type MissionStatus = 'done' | 'progress' | 'todo';

export interface MallAgentMission {
  id: string;
  /** 사장님이 준 미션인가, 에이전트가 더한 제안인가. */
  origin: 'owner' | 'agent';
  title: string;
  /** 무엇을 해내는 미션인가. */
  goal: string;
  status: MissionStatus;
  /** 지금 실제로 되는 것 — 코드와 화면에서 확인한 사실만. */
  now: string;
  /** 다음에 할 일. */
  next: string;
  href?: { path: string; label: string };
}

/** 에이전트가 무엇을 하든 지키는 원칙. 이 프로젝트에서 실제로 지켜 온 규칙이다. */
export const MALL_AGENT_PRINCIPLES: readonly string[] = [
  '제출·삭제·완전품절처럼 되돌리기 어려운 일은 사람이 누른다. 에이전트는 채우고, 확인하고, 알린다.',
  '몰 계정 비밀번호는 코드·기록·알림 어디에도 남기지 않는다.',
  '모르는 것을 0 이나 초록으로 칠하지 않는다. 확인된 것만 됐다고 말한다.',
  '몰마다 그 몰의 경로로 한다. 남의 몰 로그인에 기대지 않는다.',
];

function ratio(totals: CapabilityTotals, key: CapabilityKey): string {
  const counts = totals[key];
  return `${counts.ready}/${counts.ready + counts.pending + counts.unavailable}곳`;
}

/** 몰마다 네 가지 일이 얼마나 되는가 — 회색이 하나도 없으면 됨, 초록이 하나라도 있으면 일부. */
export function coverageStatus(totals: CapabilityTotals | null): MissionStatus {
  if (!totals) return 'progress';
  const keys = Object.keys(totals) as CapabilityKey[];
  // 개념이 없는 칸(빨강)은 할 일이 아니다. 회색이 하나도 없으면 다 된 것이다.
  if (keys.every((key) => totals[key].pending === 0)) return 'done';
  return keys.some((key) => totals[key].ready > 0) ? 'progress' : 'todo';
}

/**
 * 미션 목록. `totals` 는 쇼핑몰 현황과 같은 판정이다. 아직 못 받았으면 null —
 * 그때 숫자 자리는 '불러오는 중' 으로 두고 상태를 지어내지 않는다.
 */
export function buildMallAgentMissions(totals: CapabilityTotals | null): MallAgentMission[] {
  const live = (text: (value: CapabilityTotals) => string) => (totals ? text(totals) : '숫자를 불러오는 중입니다.');
  return [
    {
      id: 'form-self-heal',
      origin: 'owner',
      title: '등록 폼이 바뀌면 스스로 고친다',
      goal: '몰이 상품등록 폼을 바꿔 갑자기 등록이 안 되면, AI 가 폼을 다시 분석해 칸 지도를 고치고 다시 채운다.',
      status: 'todo',
      now: '폼이 바뀌면 채움 결과에 "칸을 찾지 못했습니다" 같은 경고가 남고, 사람이 화면을 다시 실측해 고친다.',
      next: '경고가 나면 Agent OS 가 그 폼을 다시 읽어(칸 이름·줄 제목·버튼) 바뀐 칸을 찾고, 고친 채움 방식을 사람이 확인한 뒤 반영한다.',
      href: { path: '/mall-listings', label: '상품 등록' },
    },
    {
      id: 'mall-notices',
      origin: 'owner',
      title: '몰 공지와 알림을 모아 보여 준다',
      goal: '몰마다 판매자센터 공지사항과 알림(수수료·정책 변경, 점검, 휴무, 제재)을 모아 한곳에서 보여 준다.',
      status: 'todo',
      now: '몰 공지를 가져오지 않는다. 사람이 몰에 들어가 봐야 안다.',
      next: '몰마다 공지 게시판을 읽어 새 글과 중요 공지를 모으고, 우리 상품·주문에 영향이 있는 것을 먼저 올린다.',
    },
    {
      id: 'incident-report',
      origin: 'owner',
      title: '문제가 생기면 즉시 보고한다',
      goal: '로그인 풀림, 주문수집 실패, 등록 폼 오류, 송장 실패처럼 몰에 문제가 생기면 바로 알린다.',
      status: 'progress',
      now: '쇼핑몰 홈 알림판이 몰 작업 알림(주문수집 · 쿠팡 수집 · 동기화)과 로그인 풀림 · 로그인 정보 · 품절 후보 · 쿠팡 발주확인 대기를 한곳에 모은다. 로그인 풀림은 홈을 열 때 확장이 몰마다 조용히 확인한다. 등록 폼 · 로그인 테스트 결과는 각 화면의 현재 실행 상태로 보인다. 송장 결과는 아직 어디에도 남지 않는다.',
      next: '등록 폼 경고와 송장 결과도 알림으로 남기고, 급한 알림은 화면을 열지 않아도 바로 닿게 한다.',
    },
    {
      id: 'learning-loop',
      origin: 'owner',
      title: '해 본 일에서 배우고 나아진다',
      goal: '쇼핑몰 담당 에이전트로서 채움·수집·송신 결과와 사람이 고친 값을 학습해 다음 판단을 스스로 고친다(강화학습).',
      status: 'progress',
      now: '로그인 확인 · 로그인 테스트 · 등록 폼 결과는 각 화면의 현재 실행 상태로 보인다. 주문수집 결과는 주문 쪽 수집 기록이 가진다. 사람이 고른 몰 등록 값도 상품마다 저장한다. 사람이 고친 칸은 아직 모으지 않고, 실행 결과로 판단을 고치는 학습도 아직 없다.',
      next: '쌓인 결과로 몰별 성공률과 자주 막히는 이유를 보여 주고, 통한 방식은 먼저 · 실패한 방식은 피하게 한다. 결과를 보상으로 쓰는 학습은 기록이 충분히 쌓인 뒤 붙인다.',
    },
    {
      id: 'coverage',
      origin: 'agent',
      title: '연결된 모든 몰에서 네 가지 일이 되게 한다',
      goal: '주문수집 · 송장전송 · 상품등록 · 품절관리를 연결된 모든 몰에서 되게 한다.',
      status: coverageStatus(totals),
      now: live((value) => `주문수집 ${ratio(value, 'orders')} · 송장전송 ${ratio(value, 'tracking')} · 상품등록 ${ratio(value, 'register')} · 품절관리 ${ratio(value, 'soldout')}`),
      next: '회색이 많은 일부터 몰을 늘린다. 몰마다 실제로 등록된 상품을 먼저 보고 붙인다.',
      href: { path: '/mall-channels', label: '쇼핑몰 현황' },
    },
    {
      id: 'login',
      origin: 'agent',
      title: '몰 로그인을 지킨다',
      goal: '몰 로그인이 풀려도 일이 멈추지 않게 한다.',
      status: 'progress',
      now: '쇼핑몰 홈을 열면 확장이 몰 관리자 화면을 조용히 읽고, 그걸로 모르면 화면을 열어 보고 닫아 몰마다 로그인됨 · 인증 필요 · 로그인 필요를 보여 준다(로그인은 하지 않는다). 주문수집·상품등록 전에는 저장된 계정으로 자동 로그인을 시도하고, 캡차·OTP·토큰 방식 몰은 사람을 부른다.',
      next: '조용히 확인하는 몰을 늘리고, 로그인이 풀린 몰은 주문수집 시간 전에 미리 알린다.',
      href: { path: '/mall-settings', label: '쇼핑몰 계정' },
    },
    {
      id: 'orders',
      origin: 'agent',
      title: '주문과 클레임을 놓치지 않는다',
      goal: '몰마다 새 주문과 취소·반품·교환·문의를 빠짐없이 가져온다.',
      status: totals && totals.orders.ready === 0 ? 'todo' : 'progress',
      // 쿠팡 반품을 저장하는 코드(syncSingleReturn)는 있지만 부르는 곳이 없고, 쿠팡 어댑터에는 반품
      // 승인 호출 하나뿐이다. 클레임·문의를 실제로 가져오는 몰은 없다(2026-09-11 확인).
      now: live((value) => `주문수집은 ${ratio(value, 'orders')}에서 된다. 취소·반품·교환·문의를 따로 가져오는 몰은 아직 없다.`),
      next: '클레임·문의까지 몰마다 가져오고, 답이 늦은 문의를 먼저 올린다.',
      href: { path: '/order-collection', label: '주문수집' },
    },
    {
      id: 'soldout',
      origin: 'agent',
      title: '품절과 재고를 몰에 맞춘다',
      goal: '판매 가능 재고가 0 이 되면 몰마다 품절을, 다시 들어오면 해제를 보낸다.',
      status: totals && totals.soldout.ready > 0 ? 'progress' : 'todo',
      now: live((value) => `품절 송신은 ${ratio(value, 'soldout')}에서 된다. 보낼 후보는 계산하지만(품절 관리 미리보기) 몰에 보내는 경로가 아직 없다.`),
      next: '몰마다 품절·해제 송신을 붙이고, 보낸 뒤 몰을 다시 조회해 반영을 확인한다. G마켓·옥션은 완전품절이 영구삭제라 판매중지로 보낸다.',
      href: { path: '/mall-availability', label: '품절 관리' },
    },
    {
      id: 'preflight',
      origin: 'agent',
      title: '몰 규정을 등록 전에 걸러낸다',
      goal: '카테고리·고시·KC 인증·이미지·가격·옵션명 규정을 등록 전에 점검해 반려를 줄인다.',
      status: 'todo',
      now: '서버에 몰별 점검 규칙은 있지만 등록 흐름에는 아직 걸려 있지 않다.',
      next: '등록을 보내기 전에 점검을 돌려 걸린 항목을 먼저 보여 준다.',
    },
    {
      id: 'settlement',
      origin: 'agent',
      title: '정산과 수수료를 확인한다',
      goal: '몰마다 정산 금액과 수수료가 약속과 같은지 확인한다.',
      status: 'todo',
      now: '등록 화면이 몰별 수수료로 공급가를 계산만 한다(꼬망세·떠리몰 15%). 실제 정산과 대조하지 않는다.',
      next: '몰별 정산 내역을 가져와 수수료·금액을 맞춰 보고, 어긋나면 알린다.',
    },
  ];
}
