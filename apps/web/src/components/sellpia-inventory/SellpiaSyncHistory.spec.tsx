import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SellpiaImportRunSummary } from '@kiditem/shared/inventory';
import { SellpiaSyncHistory } from './SellpiaSyncHistory';

const baseRun: SellpiaImportRunSummary = {
  id: '11111111-1111-4111-8111-111111111111',
  fileName: 'sellpia-inventory-snapshot-v1.json',
  fileHash: 'a'.repeat(64),
  status: 'completed',
  rowCount: 12,
  importedAt: '2026-07-16T00:00:00.000Z',
  lastVerifiedAt: '2027-07-16T00:00:00.000Z',
  verificationCount: 2,
  lastTrigger: 'manual_request',
  freshnessGeneration: '2',
  manualFreshExportConfirmedAt: null,
  manualFreshExportConfirmedBy: null,
  qualityReport: null,
  errorCode: null,
  errorMessage: null,
  createdAt: '2026-07-16T00:00:00.000Z',
  updatedAt: '2027-07-16T00:00:00.000Z',
};

describe('SellpiaSyncHistory', () => {
  it('shows the latest same-hash verification time instead of the first import time', () => {
    render(<SellpiaSyncHistory items={[baseRun]} />);

    expect(screen.getByText('검증/시도 시각')).toBeInTheDocument();
    expect(screen.getByText(/2027/)).toBeInTheDocument();
    expect(screen.queryByText(/2026/)).not.toBeInTheDocument();
  });

  it('falls back to the attempt time for a pre-download failure', () => {
    render(
      <SellpiaSyncHistory
        items={[{
          ...baseRun,
          id: '22222222-2222-4222-8222-222222222222',
          fileName: null,
          fileHash: null,
          status: 'failed',
          rowCount: 0,
          importedAt: null,
          lastVerifiedAt: null,
          verificationCount: 0,
          errorCode: 'sellpia_login_required',
          errorMessage: 'Sellpia login is required.',
          updatedAt: '2028-07-16T00:00:00.000Z',
        }]}
      />,
    );

    expect(screen.getByText(/2028/)).toBeInTheDocument();
  });
});
