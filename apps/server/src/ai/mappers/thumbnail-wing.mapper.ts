/**
 * Pure response/precedence mappers for the Wing registration flow.
 *
 * The Wing service composes persistence reads, automation results, and these
 * mappers — keeping precedence rules (Coupang channel name > master name,
 * generation.selectedUrl > single-candidate fallback) out of the orchestrator.
 */

export interface WingRegistrationResult {
  success: boolean;
  screenshotPath: string | null;
  error?: string;
}

export interface WingVerificationResult {
  registered: boolean;
  detectedUrl: string | null;
  error?: string;
}

export interface MasterForWingNaming {
  name: string | null;
  listings?: Array<{ channelName: string | null }>;
}

export interface GenerationForWingSelection {
  selectedUrl: string | null;
  candidates: Array<{ url: string | null }>;
}

export interface RegistrationAttemptForVerification {
  status: string;
  errorMessage: string | null;
}

export function pickWingProductName(master: MasterForWingNaming): string {
  const coupangName = master.listings?.[0]?.channelName?.trim();
  return coupangName || master.name || '';
}

export function pickRegistrationImageUrl(generation: GenerationForWingSelection): string | null {
  if (generation.selectedUrl) return generation.selectedUrl;
  if (generation.candidates.length === 1) return generation.candidates[0]?.url ?? null;
  return null;
}

export function toRegistrationResult(
  automation: { success: boolean; error?: string },
  screenshotPath: string,
): WingRegistrationResult {
  return {
    success: automation.success,
    screenshotPath: automation.success ? screenshotPath : null,
    ...(automation.error !== undefined ? { error: automation.error } : {}),
  };
}

export function toVerificationResult(
  latest: RegistrationAttemptForVerification | null,
  generation: { selectedUrl: string | null },
): WingVerificationResult {
  const registered = latest?.status === 'registered';
  const result: WingVerificationResult = {
    registered,
    detectedUrl: registered ? generation.selectedUrl ?? null : null,
  };
  if (latest?.errorMessage) result.error = latest.errorMessage;
  return result;
}
