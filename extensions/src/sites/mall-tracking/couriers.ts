/**
 * 셀피아 택배사 코드 → 몰 화면의 택배사 이름(KID-366 wave8b — 옛 웹 `icecream-tracking-api.ts` `COURIER_NAME` 이식). 셀피아
 * 송장 조회 캡처의 `courier`는 코드(예 1136 = CJ대한통운)다. 몰 어댑터는 이 이름으로 몰의 택배사 목록(온채널 #deliveryObjs,
 * 키드키즈 select)에서 몰 값을 찾는다. 모르는 코드는 옛 웹 규칙대로 CJ대한통운, 코드가 아닌 이름은 그대로 쓴다.
 */
const SELLPIA_COURIER_NAMES: Readonly<Record<string, string>> = Object.freeze({
  '1136': 'CJ대한통운',
  '10': 'CJ대한통운',
});
const DEFAULT_COURIER = 'CJ대한통운';

export function courierName(courier: string): string {
  const value = courier.trim();
  if (!value) return DEFAULT_COURIER;
  if (/^\d+$/.test(value)) return SELLPIA_COURIER_NAMES[value] ?? DEFAULT_COURIER;
  return value;
}
