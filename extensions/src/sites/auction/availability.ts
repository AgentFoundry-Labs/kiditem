import { registerEsmAvailability } from '../gmarket/esm-availability';

/** 옥션 품절·재개·지금 상태 — ESM Plus의 옥션 판매 여부(`iac`, 사이트상품번호가 영문 한 글자로 시작한다). */
registerEsmAvailability('auction', '옥션', 'iac');
