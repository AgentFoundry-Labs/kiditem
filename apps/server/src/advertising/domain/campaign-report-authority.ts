import { AdCampaignReportScopeSchema } from '@kiditem/shared/advertising';
import { canonicalCampaignIdentity } from './util/ad-target-key';

export interface CampaignReportAuthorityInput {
  campaignReportScope?: string | null;
  dashboardOnOff?: string | null;
  normalizedRows?: ReadonlyArray<Record<string, unknown>>;
  hasSingleDayRange: boolean;
}

export interface CampaignReportAuthorityDecision {
  requestedScope: string | null;
  effectiveScope: 'single_campaign_authoritative' | 'raw_only';
  reason:
    | 'authoritative_single_campaign'
    | 'off_campaign_metadata'
    | 'non_authoritative_scope'
    | 'missing_scope'
    | 'unknown_scope'
    | 'missing_stable_campaign_identity'
    | 'invalid_authoritative_shape'
    | 'invalid_date_range';
  projectionRejectionCode:
    | null
    | 'missing_stable_campaign_identity'
    | 'invalid_authoritative_shape'
    | 'invalid_date_range';
}

function normalizedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizedState(value: unknown): string | null {
  return normalizedString(value)?.toUpperCase() ?? null;
}

function campaignIdentity(row: Record<string, unknown>): string | null {
  return canonicalCampaignIdentity({
    campaignId: normalizedString(row.campaignId),
    campaignIdentity: normalizedString(row.campaignIdentity),
  });
}

function rawDecision(
  requestedScope: string | null,
  reason: CampaignReportAuthorityDecision['reason'],
  projectionRejectionCode: CampaignReportAuthorityDecision['projectionRejectionCode'] = null,
): CampaignReportAuthorityDecision {
  return {
    requestedScope,
    effectiveScope: 'raw_only',
    reason,
    projectionRejectionCode,
  };
}

export function resolveCampaignReportAuthority(
  input: CampaignReportAuthorityInput,
): CampaignReportAuthorityDecision {
  const requestedScope = normalizedString(input.campaignReportScope);
  const rows = input.normalizedRows ?? [];
  const dashboardState = normalizedState(input.dashboardOnOff);

  if (
    dashboardState === 'OFF' ||
    rows.some((row) =>
      row._campaignOnly === true && normalizedState(row.onOff) === 'OFF',
    )
  ) {
    return rawDecision(requestedScope, 'off_campaign_metadata');
  }

  if (requestedScope === null) {
    return rawDecision(null, 'missing_scope');
  }
  const parsedScope = AdCampaignReportScopeSchema.safeParse(requestedScope);
  if (!parsedScope.success) {
    return rawDecision(requestedScope, 'unknown_scope');
  }
  if (parsedScope.data !== 'single_campaign_authoritative') {
    return rawDecision(requestedScope, 'non_authoritative_scope');
  }
  if (!input.hasSingleDayRange) {
    return rawDecision(
      requestedScope,
      'invalid_date_range',
      'invalid_date_range',
    );
  }

  const identities = new Set<string>();
  let shapeValid = rows.length > 0;
  let missingStableIdentity = false;
  for (const row of rows) {
    const identity = campaignIdentity(row);
    if (!identity) {
      shapeValid = false;
      missingStableIdentity = true;
    }
    else identities.add(identity);
  }

  const descriptors = rows.filter((row) => row._campaignOnly === true);
  const details = rows.filter((row) => row._campaignOnly !== true);
  const stateIsOn = (row: Record<string, unknown>) =>
    normalizedState(row.onOff) ?? dashboardState;
  const hasOnDetails =
    details.length > 0 &&
    descriptors.length === 0 &&
    details.every((row) => stateIsOn(row) === 'ON');
  const hasExplicitEmptyOn =
    descriptors.length === 1 &&
    details.length === 0 &&
    stateIsOn(descriptors[0]) === 'ON';

  shapeValid =
    shapeValid &&
    identities.size === 1 &&
    (hasOnDetails || hasExplicitEmptyOn);
  if (!shapeValid) {
    if (missingStableIdentity) {
      return rawDecision(
        requestedScope,
        'missing_stable_campaign_identity',
        'missing_stable_campaign_identity',
      );
    }
    return rawDecision(
      requestedScope,
      'invalid_authoritative_shape',
      'invalid_authoritative_shape',
    );
  }

  return {
    requestedScope,
    effectiveScope: 'single_campaign_authoritative',
    reason: 'authoritative_single_campaign',
    projectionRejectionCode: null,
  };
}
