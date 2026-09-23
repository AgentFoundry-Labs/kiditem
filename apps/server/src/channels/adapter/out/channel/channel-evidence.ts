import type {
  ChannelAccountIdentity,
  ConfirmationEvidenceInput,
  ProviderEvidenceDecision,
} from '../../../application/port/out/channel/channel-adapter.port';

/**
 * 확인 증거 판정 — 어댑터마다 다른 것은 "이 몰의 계정 식별자 · 관리자 origin · 상품 id 형식" 셋뿐이고
 * 판정 순서는 하나다(KID-321). 있는 값이 틀리면 먼저 거절하고, 준비가 몰 계정 식별자를 얼렸는데
 * 증거에 없으면 마지막에 `missing_account` 다 — 확인(`confirmed`)이 아닌 보고는 그 하나만 넘긴다.
 */
export function decideConfirmationEvidence(input: {
  account: ChannelAccountIdentity;
  accountProviderId: string | null;
  expectedProviderAccountId: string | null;
  evidence: ConfirmationEvidenceInput;
  isTrustedAdminUrl: (url: URL) => boolean;
  externalListingIdPattern: RegExp | null;
}): ProviderEvidenceDecision {
  const providerAccountId = trimmed(input.evidence.providerAccountId);
  const observedUrl = trimmed(input.evidence.observedUrl);
  const externalListingId = trimmed(input.evidence.externalListingId);
  const expected = trimmed(input.expectedProviderAccountId);
  if (input.accountProviderId !== expected) return { ok: false, reason: 'account_mismatch' };
  if (providerAccountId !== null && providerAccountId !== expected) return { ok: false, reason: 'account_mismatch' };
  if (observedUrl !== null && !trustedUrl(observedUrl, input.isTrustedAdminUrl)) return { ok: false, reason: 'untrusted_url' };
  if (externalListingId !== null && input.externalListingIdPattern && !input.externalListingIdPattern.test(externalListingId)) {
    return { ok: false, reason: 'invalid_listing_id' };
  }
  if (expected !== null && providerAccountId === null) return { ok: false, reason: 'missing_account' };
  return { ok: true };
}

/** https, 자격 증명 없음, 그리고 어댑터가 말하는 관리자 origin. */
function trustedUrl(value: string, isTrustedAdminUrl: (url: URL) => boolean): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return false;
  return isTrustedAdminUrl(parsed);
}

export function trimmed(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}
