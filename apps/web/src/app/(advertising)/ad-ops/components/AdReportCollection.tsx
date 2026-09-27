'use client';

import { CollectionStartControl } from '@/components/collection/CollectionStartControl';
import { useCollectionSourceControl } from '@/hooks/use-collection-source-control';
import { COLLECTION_STOPPED_MESSAGE } from '@/lib/collection-source-status-query';
import { attemptFailureText } from '@/lib/operator-error';
import {
  adReportCollection,
  adReportResult,
  adReportWarningText,
  latestAdReportOperation,
} from '../lib/ad-report-collection';

/** Starts and stops the ad report operation and shows its last confirmed window and settlement warnings. */
export function AdReportCollection() {
  const control = useCollectionSourceControl(adReportCollection);
  const latest = latestAdReportOperation(control.status);
  const stopped = latest?.status === 'cancelled';
  const failure = stopped
    ? COLLECTION_STOPPED_MESSAGE
    : latest?.status === 'failed'
      ? attemptFailureText(latest, 'advertising.ad_report') ?? '최근 광고 보고서 수집에 실패했습니다.'
      : null;
  const result = adReportResult(latest);
  const warning = result ? adReportWarningText(result) : null;

  return (
    <div className="flex flex-wrap items-start justify-end gap-3" data-testid="ad-report-collection">
      {result && (
        <p className="text-[11px]" data-testid="ad-report-last-run" style={{ color: 'var(--text-tertiary)' }}>
          최근 수집 {result.startDate} ~ {result.confirmedEndDate}
          {warning && (
            <span data-testid="ad-report-warnings" style={{ color: 'var(--warning)' }}>
              {' · '}{warning}
            </span>
          )}
        </p>
      )}
      {failure && (
        <p
          className="text-[11px]"
          data-testid={stopped ? 'ad-report-stopped' : 'ad-report-failure'}
          style={{ color: stopped ? 'var(--warning)' : 'var(--danger)' }}
        >
          {failure}
        </p>
      )}
      <CollectionStartControl
        control={control}
        startLabel="광고 보고서 수집"
        onStart={() => control.start()}
        onStop={control.stop}
      />
    </div>
  );
}
