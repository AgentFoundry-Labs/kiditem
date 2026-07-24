import { describe, expect, it } from 'vitest';
import { resolveCampaignReportAuthority } from '../campaign-report-authority';

const detail = (overrides: Record<string, unknown> = {}) => ({
  campaignIdentity: 'href:https://advertising.coupang.com/campaign/1',
  campaignName: 'Campaign 1',
  spend: 100,
  ...overrides,
});

describe('resolveCampaignReportAuthority', () => {
  it('accepts one exact-day ON campaign detail report', () => {
    expect(resolveCampaignReportAuthority({
      campaignReportScope: ' single_campaign_authoritative ',
      dashboardOnOff: ' on ',
      normalizedRows: [detail()],
      hasSingleDayRange: true,
    })).toEqual({
      requestedScope: 'single_campaign_authoritative',
      effectiveScope: 'single_campaign_authoritative',
      reason: 'authoritative_single_campaign',
      projectionRejectionCode: null,
    });
  });

  it('treats provider id and equivalent Coupang detail href as one campaign authority', () => {
    expect(resolveCampaignReportAuthority({
      campaignReportScope: 'single_campaign_authoritative',
      dashboardOnOff: 'ON',
      normalizedRows: [
        detail({ campaignId: 'X', campaignIdentity: null }),
        detail({
          campaignIdentity:
            'href:https://advertising.coupang.com/marketing/campaign/X/product?campaignId=X#ignored',
        }),
      ],
      hasSingleDayRange: true,
    })).toMatchObject({
      effectiveScope: 'single_campaign_authoritative',
      reason: 'authoritative_single_campaign',
      projectionRejectionCode: null,
    });
  });

  it('accepts exactly one explicit-empty ON descriptor', () => {
    expect(resolveCampaignReportAuthority({
      campaignReportScope: 'single_campaign_authoritative',
      dashboardOnOff: 'ON',
      normalizedRows: [detail({ _campaignOnly: true, onOff: 'ON' })],
      hasSingleDayRange: true,
    }).effectiveScope).toBe('single_campaign_authoritative');
  });

  it.each([
    { dashboardOnOff: ' off ', normalizedRows: [detail()] },
    {
      dashboardOnOff: 'ON',
      normalizedRows: [detail({ _campaignOnly: true, onOff: ' off ' })],
    },
  ])('downgrades OFF metadata without rejection', (evidence) => {
    expect(resolveCampaignReportAuthority({
      campaignReportScope: 'single_campaign_authoritative',
      ...evidence,
      hasSingleDayRange: true,
    })).toMatchObject({
      effectiveScope: 'raw_only',
      reason: 'off_campaign_metadata',
      projectionRejectionCode: null,
    });
  });

  it.each([
    { scope: undefined, reason: 'missing_scope' },
    { scope: 'future_authoritative', reason: 'unknown_scope' },
    { scope: 'single_campaign_metadata_raw', reason: 'non_authoritative_scope' },
    { scope: 'multi_campaign_raw', reason: 'non_authoritative_scope' },
  ])('keeps $scope raw-only', ({ scope, reason }) => {
    expect(resolveCampaignReportAuthority({
      campaignReportScope: scope,
      dashboardOnOff: 'ON',
      normalizedRows: [detail()],
      hasSingleDayRange: true,
    })).toMatchObject({
      requestedScope: scope ?? null,
      effectiveScope: 'raw_only',
      reason,
      projectionRejectionCode: null,
    });
  });

  it.each([
    { normalizedRows: [detail(), detail({ campaignIdentity: 'campaign:2' })] },
    { normalizedRows: [detail({ _campaignOnly: true }), detail({ _campaignOnly: true })] },
    { normalizedRows: [detail({ onOff: 'OFF' })] },
    { normalizedRows: [] },
  ])('rejects malformed claimed-authoritative shapes', ({ normalizedRows }) => {
    expect(resolveCampaignReportAuthority({
      campaignReportScope: 'single_campaign_authoritative',
      dashboardOnOff: 'ON',
      normalizedRows,
      hasSingleDayRange: true,
    })).toMatchObject({
      effectiveScope: 'raw_only',
      reason: 'invalid_authoritative_shape',
      projectionRejectionCode: 'invalid_authoritative_shape',
    });
  });

  it('reports a distinct observable reason when stable identity is missing', () => {
    expect(resolveCampaignReportAuthority({
      campaignReportScope: 'single_campaign_authoritative',
      dashboardOnOff: 'ON',
      normalizedRows: [detail({ campaignIdentity: null, campaignId: null })],
      hasSingleDayRange: true,
    })).toMatchObject({
      effectiveScope: 'raw_only',
      reason: 'missing_stable_campaign_identity',
      projectionRejectionCode: 'missing_stable_campaign_identity',
    });
  });

  it.each([
    'name:표시명',
    'href:https://advertising.coupang.com/marketing/dashboard/sales',
    'href:https://advertising.coupang.com.evil.test/campaign/1',
    'href:https://example.test/campaign/1',
    'arbitrary-token',
  ])('treats unsafe pseudo identity %s as missing', (campaignIdentity) => {
    expect(resolveCampaignReportAuthority({
      campaignReportScope: 'single_campaign_authoritative',
      dashboardOnOff: 'ON',
      normalizedRows: [detail({ campaignIdentity, campaignId: null })],
      hasSingleDayRange: true,
    })).toMatchObject({
      effectiveScope: 'raw_only',
      reason: 'missing_stable_campaign_identity',
      projectionRejectionCode: 'missing_stable_campaign_identity',
    });
  });

  it('rejects a claimed authoritative multi-day range', () => {
    expect(resolveCampaignReportAuthority({
      campaignReportScope: 'single_campaign_authoritative',
      dashboardOnOff: 'ON',
      normalizedRows: [detail()],
      hasSingleDayRange: false,
    })).toMatchObject({
      effectiveScope: 'raw_only',
      reason: 'invalid_date_range',
      projectionRejectionCode: 'invalid_date_range',
    });
  });
});
