/**
 * 워크북 관측의 파일 키 `rocket-final-order:<직배송 실행 id>:<운송유형 소문자>`(KID-359). 관측 행의 `directshipOperationId`는
 * 뒤이은 빈 탐색이 덮어쓰지만 이 키는 파일을 낸 실행에 고정된다 — 셀피아 전송 원천은 이 키에서 읽는다(KID-388).
 */
export type RocketTransmissionTransport = 'SHIPMENT' | 'MILKRUN';

const PREFIX = 'rocket-final-order';
const KEY = /^rocket-final-order:([0-9a-f-]{36}):(shipment|milkrun)$/i;

export function rocketTransmissionKey(directshipOperationId: string, transport: RocketTransmissionTransport): string {
  return `${PREFIX}:${directshipOperationId}:${transport.toLowerCase()}`;
}

/** 키를 전송 원천 `{sourceOperationId, transport}`로 푼다(운송유형은 대문자). 이 모양이 아니면 null. */
export function parseRocketTransmissionKey(
  key: string,
): { sourceOperationId: string; transport: RocketTransmissionTransport } | null {
  const match = KEY.exec(key);
  if (!match) return null;
  return { sourceOperationId: match[1]!.toLowerCase(), transport: match[2]!.toUpperCase() as RocketTransmissionTransport };
}
