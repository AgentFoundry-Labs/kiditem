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
  // Detail-row onOff is the advertised product state, not the campaign state.
  // A running campaign may legitimately contain paused/rejected products, so
  // campaign authority comes from the separately observed dashboard state.
  // `dashboardOnOff` is current campaign state. It cannot revoke historical
  // authority for an exact provider detail day: a campaign that is OFF now
  // may still have spend/revenue in the requested 31-day window.
  const hasDetailsFromKnownCampaign =
    details.length > 0 &&
    descriptors.length === 0 &&
    (dashboardState === 'ON' || dashboardState === 'OFF');
  const explicitEmptyState =
    descriptors.length === 1
      ? (normalizedState(descriptors[0].onOff) ?? dashboardState)
      : null;
  const hasExplicitEmptyDescriptor =
    descriptors.length === 1 &&
    details.length === 0 &&
    (explicitEmptyState === 'ON' || explicitEmptyState === 'OFF');

  shapeValid =
    shapeValid &&
    identities.size === 1 &&
    (hasDetailsFromKnownCampaign || hasExplicitEmptyDescriptor);
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
