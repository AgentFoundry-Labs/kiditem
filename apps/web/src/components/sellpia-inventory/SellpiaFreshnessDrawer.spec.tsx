import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SellpiaFreshnessDrawer } from './SellpiaFreshnessDrawer';

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const baseState = {
  status: 'syncing' as const,
  sourceBinding: {
    origin: 'https://kiditem.sellpia.com' as const,
    accountKey: null,
    confirmed: false as const,
  },
  lastVerifiedAt: '2026-07-16T00:00:00.000Z',
  expiresAt: '2026-07-16T00:10:00.000Z',
  requestedGeneration: '2',
  verifiedGeneration: '1',
  refreshRequestedAt: '2026-07-16T00:01:00.000Z',
  refreshReason: 'ttl_expired' as const,
  syncNotBefore: null,
  activeSync: {
    runId: RUN_ID,
    generation: '2',
    startedAt: '2026-07-16T00:02:00.000Z',
    leaseExpiresAt: '2026-07-16T00:03:30.000Z',
    canControl: true,
  },
  lastAttempt: null,
};

const preDownloadFailure = {
  id: '22222222-2222-4222-8222-222222222222',
  fileName: null,
  fileHash: null,
  status: 'failed' as const,
  rowCount: 0,
  importedAt: null,
  lastVerifiedAt: null,
  verificationCount: 0,
  lastTrigger: 'ttl_expired' as const,
  freshnessGeneration: '2',
  manualFreshExportConfirmedAt: null,
  manualFreshExportConfirmedBy: null,
  qualityReport: null,
  errorCode: 'sellpia_background_timeout',
  errorMessage: 'timeout',
  createdAt: '2026-07-16T00:02:00.000Z',
  updatedAt: '2026-07-16T00:03:00.000Z',
};

const verifiedRun = {
  ...preDownloadFailure,
  id: '33333333-3333-4333-8333-333333333333',
  fileName: 'verified.xls',
  fileHash: 'a'.repeat(64),
  status: 'completed' as const,
  rowCount: 12,
  importedAt: '2026-07-16T00:00:00.000Z',
  lastVerifiedAt: '2026-07-16T00:00:00.000Z',
  verificationCount: 1,
  qualityReport: { issues: [{
    code: 'snapshot_churn',
    severity: 'warning' as const,
    count: 1,
    sampleRowNumbers: [],
    sampleProductCodes: [],
  }] },
  errorCode: null,
  errorMessage: null,
};

describe('SellpiaFreshnessDrawer', () => {
  it('separates current basis, recent attempt, and unified history including pre-download failure rows', () => {
    render(
      <SellpiaFreshnessDrawer
        open
        onOpenChange={vi.fn()}
        state={baseState}
        currentBasis={verifiedRun}
        history={[preDownloadFailure, verifiedRun]}
        userRole="member"
        ownerClaimToken={null}
        onCancel={vi.fn()}
        onConfirmBinding={vi.fn()}
        onRequestRefresh={vi.fn()}
        onManualImport={vi.fn()}
      />,
    );

    expect(screen.getByText('현재 재고 기준')).toBeInTheDocument();
    expect(screen.getByText('최근 동기화 시도')).toBeInTheDocument();
    expect(screen.getByText('이력')).toBeInTheDocument();
    expect(screen.getByText('다운로드 전 실패')).toBeInTheDocument();
    expect(screen.getAllByText('verified.xls')).toHaveLength(2);
    expect(screen.getByText('1개 경고')).toBeInTheDocument();
    expect(screen.queryByText('출처 연결 확인')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '동기화 취소' })).not.toBeInTheDocument();
  });

  it('shows fixed source confirmation only to owner/admin and controls only to the claiming tab', () => {
    const onCancel = vi.fn();
    render(
      <SellpiaFreshnessDrawer
        open
        onOpenChange={vi.fn()}
        state={baseState}
        currentBasis={null}
        history={[]}
        userRole="owner"
        ownerClaimToken={RUN_ID}
        onCancel={onCancel}
        onConfirmBinding={vi.fn()}
        onRequestRefresh={vi.fn()}
        onManualImport={vi.fn()}
      />,
    );

    expect(screen.getByText('https://kiditem.sellpia.com')).toBeInTheDocument();
    expect(screen.getByText('kiditem')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '출처 연결 확인' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '동기화 취소' }));
    expect(onCancel).toHaveBeenCalledWith(RUN_ID);
  });

  it('requires manual fresh-export attestation and has no Sellpia secret field', () => {
    render(
      <SellpiaFreshnessDrawer
        open
        onOpenChange={vi.fn()}
        state={{ ...baseState, activeSync: null, status: 'refresh_required' }}
        currentBasis={null}
        history={[]}
        userRole="admin"
        ownerClaimToken={null}
        onCancel={vi.fn()}
        onConfirmBinding={vi.fn()}
        onRequestRefresh={vi.fn()}
        onManualImport={vi.fn()}
      />,
    );

    const submit = screen.getByRole('button', { name: '수동 파일 가져오기' });
    expect(submit).toBeDisabled();
    expect(screen.queryByLabelText(/비밀번호|쿠키/)).not.toBeInTheDocument();
  });

  it('keeps the authoritative completed basis when the first 20 attempts are failures', () => {
    const failures = Array.from({ length: 20 }, (_, index) => ({
      ...preDownloadFailure,
      id: `22222222-2222-4222-8222-${String(index).padStart(12, '0')}`,
    }));

    render(
      <SellpiaFreshnessDrawer
        open
        onOpenChange={vi.fn()}
        state={{ ...baseState, activeSync: null, status: 'failed' }}
        currentBasis={{ ...verifiedRun, fileName: 'authoritative.xls' }}
        history={failures}
        userRole="member"
        ownerClaimToken={null}
        onCancel={vi.fn()}
        onConfirmBinding={vi.fn()}
        onRequestRefresh={vi.fn()}
        onManualImport={vi.fn()}
      />,
    );

    expect(screen.getByText('authoritative.xls')).toBeInTheDocument();
    expect(screen.getByText('1개 경고')).toBeInTheDocument();
  });

  it('resets manual attestation when the selected file changes', () => {
    render(
      <SellpiaFreshnessDrawer
        open
        onOpenChange={vi.fn()}
        state={{ ...baseState, activeSync: null, status: 'refresh_required' }}
        currentBasis={null}
        history={[]}
        userRole="admin"
        ownerClaimToken={null}
        onCancel={vi.fn()}
        onConfirmBinding={vi.fn()}
        onRequestRefresh={vi.fn()}
        onManualImport={vi.fn()}
      />,
    );

    const input = screen.getByLabelText('Sellpia 재고 파일');
    const confirmation = screen.getByLabelText(
      /방금 Sellpia에서 내보낸 최신 재고 파일/,
    );
    const submit = screen.getByRole('button', { name: '수동 파일 가져오기' });
    fireEvent.change(input, {
      target: { files: [new File(['first'], 'first.xls')] },
    });
    fireEvent.click(confirmation);
    expect(submit).toBeEnabled();

    fireEvent.change(input, {
      target: { files: [new File(['second'], 'second.xls')] },
    });

    expect(confirmation).not.toBeChecked();
    expect(submit).toBeDisabled();
  });
});
