import { RuntimeError } from '../../core/errors';
import type { SiteCaller } from '../../core/site-caller';

/**
 * 로그인한 Wing 세션이 어느 판매자인가(KID-362 M1). 옛 content script 가드 `shared/wing-account-identity.js`와 같은
 * 근거를 서비스워커의 페이지 GET 한 번으로 읽는다: 인라인 부트스트랩 스크립트의 `vendorId: '…'`, 계정 메뉴의
 * `업체코드 …` 라벨, `data-vendor-id` 속성. 외부 스크립트(`src`)는 보지 않는다. 근거가 없거나 서로 다른 식별자가
 * 둘 이상이면 추측하지 않고 멈춘다 — 다른 계정의 Wing 세션이 읽은 값을 이 계정에 쓰지 않는다. 읽기 전용이다.
 */
export const WING_VENDOR_IDENTITY_UNAVAILABLE = 'WING_VENDOR_IDENTITY_UNAVAILABLE' as const;
export const WING_VENDOR_IDENTITY_AMBIGUOUS = 'WING_VENDOR_IDENTITY_AMBIGUOUS' as const;

const ID = '([A-Za-z0-9][A-Za-z0-9_-]{0,79})';
const INLINE_SCRIPT = /<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
const SCRIPT_VENDOR_ID = new RegExp(`["']?vendorId["']?\\s*[:=]\\s*["']${ID}["']`, 'g');
const LABELED_VENDOR_ID = new RegExp(`업체코드[\\s:]*${ID}`, 'g');
const DATA_VENDOR_ID = new RegExp(`data-vendor-id\\s*=\\s*["']${ID}["']`, 'g');

/** 페이지 HTML에서 판매자 식별자 후보(중복 제거). */
export function wingVendorIdsInPage(html: string): string[] {
  const found = new Set<string>();
  for (const script of html.matchAll(INLINE_SCRIPT)) {
    for (const match of (script[1] ?? '').matchAll(SCRIPT_VENDOR_ID)) found.add(match[1]!);
  }
  const text = html.replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ');
  for (const match of text.matchAll(LABELED_VENDOR_ID)) found.add(match[1]!);
  for (const match of html.matchAll(DATA_VENDOR_ID)) found.add(match[1]!);
  return [...found];
}

/** `pageUrl`(그 kind가 쓰는 Wing 화면)을 읽어 판매자 식별자 하나를 돌려준다. */
export async function readWingVendorId(caller: SiteCaller, pageUrl: string): Promise<string> {
  const html = await caller.text(pageUrl, { method: 'GET', headers: { Accept: 'text/html' } });
  const candidates = wingVendorIdsInPage(html);
  if (candidates.length === 0) {
    throw new RuntimeError(WING_VENDOR_IDENTITY_UNAVAILABLE, 'Wing 로그인 계정의 업체코드를 확인하지 못했습니다. Wing을 새로 고친 뒤 다시 시도해 주세요.', { url: pageUrl });
  }
  if (candidates.length > 1) {
    throw new RuntimeError(WING_VENDOR_IDENTITY_AMBIGUOUS, 'Wing 화면에 업체코드가 여러 개 보여 로그인 계정을 확정하지 못했습니다.', { url: pageUrl, candidates: candidates.length });
  }
  return candidates[0]!;
}
