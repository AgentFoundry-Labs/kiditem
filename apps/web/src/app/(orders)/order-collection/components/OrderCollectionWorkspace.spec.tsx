import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('OrderCollectionWorkspace', () => {
  it('preserves the exact c9 visual block order without the retired freshness drawer entry', () => {
    const source = readFileSync(
      path.join(import.meta.dirname, 'OrderCollectionWorkspace.tsx'),
      'utf8',
    );

    const pipeline = source.indexOf('<OrderCollectionPipeline');
    const daily = source.indexOf('<OrderCollectionDailyPanel');
    const activity = source.indexOf('<OrderActivityFeed');
    const malls = source.indexOf('<MallAccountSection');
    const preview = source.indexOf('<FilePreviewSection');
    const generated = source.indexOf('<GeneratedFilesSection');

    expect(source).not.toContain('<SellpiaWorkspaceFreshnessStatus');
    expect(source).toContain('미접수 확인 후 재전송');
    expect(source).toContain('retryConfirmed: true');
    expect(source).toContain('acquireGeneratedFiles([item.id])');
    expect(source).toContain('const batch = [...items]');
    expect(source).toContain('lockedFileIds={lockedFileIds}');
    expect(source).toContain('onDownload={handleDownloadGeneratedFile}');
    expect(source).not.toContain('onDownload={downloadOrderCollectionFile}');
    expect(source).not.toContain('sellpiaSendLockRef');
    expect(source).not.toContain('<OrderCollectionRecovery');
    // 달력이 여는 직배송 시작 두 곳은 409 를 오류가 아니라 진행 중으로 읽는다(KID-106 Q6).
    expect(source.split('directshipAlreadyRunning(err)')).toHaveLength(3);
    expect(pipeline).toBeLessThan(daily);
    expect(daily).toBeLessThan(activity);
    expect(activity).toBeLessThan(malls);
    expect(malls).toBeLessThan(preview);
    expect(preview).toBeLessThan(generated);
  });
});
