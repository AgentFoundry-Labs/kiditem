import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('OrderCollectionWorkspace', () => {
  /**
   * 몰 설정 저장은 ChannelAccount 행을 만들어 원천 목록의 그 칸을 채운다. 몰 계정
   * 목록만 다시 읽으면 목록 캐시가 그대로라, 방금 저장한 몰의 카드가 유휴 폴링이
   * 돌 때까지 시작을 계속 거절한다. 저장과 새로고침 두 곳 모두 목록도 다시 읽는다
   * (KID-170).
   */
  it('re-reads the shared source list wherever it refreshes the mall accounts', () => {
    const source = readFileSync(
      path.join(import.meta.dirname, 'OrderCollectionWorkspace.tsx'),
      'utf8',
    );

    // 저장 성공과 몰 목록 새로고침 두 곳.
    expect(source.split('invalidateMallOrderCollectionSources(')).toHaveLength(3);
  });

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
    // 화면이 자기 절차에서 닫는 실패는 중단된 시도를 실패로 닫지 않는다(KID-159). 달력의 불러오기는
    // use-coupang-directship-calendar 가 같은 규칙으로 닫는다(KID-198).
    expect(source.split('sessionControls.failRunUnlessStopped(')).toHaveLength(2);
    const calendarSource = readFileSync(
      path.join(import.meta.dirname, '../hooks/use-coupang-directship-calendar.ts'),
      'utf8',
    );
    expect(calendarSource.split('sessionControls.failRunUnlessStopped(')).toHaveLength(2);
    expect(calendarSource).not.toContain('sessionControls.failRun(');
    expect(source).not.toContain('sessionControls.failRun(');
    expect(pipeline).toBeLessThan(daily);
    expect(daily).toBeLessThan(activity);
    expect(activity).toBeLessThan(malls);
    expect(malls).toBeLessThan(preview);
    expect(preview).toBeLessThan(generated);
  });
});
