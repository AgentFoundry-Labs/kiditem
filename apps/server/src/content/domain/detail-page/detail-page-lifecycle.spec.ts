import { describe, expect, it } from 'vitest';
import { canTransitionDetailPage, decideRevisionPointer, decideWorkspacePointer, initialDetailPageStatus } from './detail-page-lifecycle';

describe('detail page lifecycle', () => {
  it('생성만 pending 에서 시작하고 나머지는 처음부터 ready 다', () => {
    expect(initialDetailPageStatus('generated')).toBe('pending');
    expect(initialDetailPageStatus('manual')).toBe('ready');
    expect(initialDetailPageStatus('uploaded')).toBe('ready');
    expect(initialDetailPageStatus('imported')).toBe('ready');
  });

  it('pending → processing → ready | failed, failed → pending 재시도, ready 는 끝', () => {
    expect(canTransitionDetailPage('pending', 'processing')).toBe(true);
    expect(canTransitionDetailPage('processing', 'ready')).toBe(true);
    expect(canTransitionDetailPage('processing', 'failed')).toBe(true);
    expect(canTransitionDetailPage('failed', 'pending')).toBe(true);
    expect(canTransitionDetailPage('ready', 'pending')).toBe(false);
    expect(canTransitionDetailPage('pending', 'ready')).toBe(false);
  });

  it('사람이 만든 revision 은 늘 현재가 된다', () => {
    expect(decideRevisionPointer({ currentRevisionType: 'generated', incomingRevisionType: 'manual_edit' })).toEqual({ advancePointer: true });
    expect(decideRevisionPointer({ currentRevisionType: 'manual_edit', incomingRevisionType: 'duplicate' })).toEqual({ advancePointer: true });
  });

  it('기계가 만든 revision 은 현재가 사람의 것이 아닐 때만 현재가 된다', () => {
    expect(decideRevisionPointer({ currentRevisionType: null, incomingRevisionType: 'generated' })).toEqual({ advancePointer: true });
    expect(decideRevisionPointer({ currentRevisionType: 'imported', incomingRevisionType: 'generated' })).toEqual({ advancePointer: true });
    expect(decideRevisionPointer({ currentRevisionType: 'generated', incomingRevisionType: 'imported' })).toEqual({ advancePointer: true });
    expect(decideRevisionPointer({ currentRevisionType: 'manual_edit', incomingRevisionType: 'generated' })).toEqual({ advancePointer: false });
    expect(decideRevisionPointer({ currentRevisionType: 'duplicate', incomingRevisionType: 'imported' })).toEqual({ advancePointer: false });
  });

  it('기계가 만든 revision 은 자기 페이지 포인터를 옮겼을 때만, 그리고 워크스페이스 현재가 사람의 것이 아닐 때만 워크스페이스 포인터를 옮긴다', () => {
    // 재가져오기가 사람이 고친 페이지에 쌓이면(페이지 포인터 안 옮김) 몰 포인터도 그대로 — 운영자가 고른 다른 페이지의 revision 위로 올라가지 않는다.
    expect(decideWorkspacePointer({ pageAdvanced: false, workspaceCurrentRevisionType: 'generated', incomingRevisionType: 'imported' })).toEqual({ advancePointer: false });
    expect(decideWorkspacePointer({ pageAdvanced: true, workspaceCurrentRevisionType: 'manual_edit', incomingRevisionType: 'imported' })).toEqual({ advancePointer: false });
    expect(decideWorkspacePointer({ pageAdvanced: true, workspaceCurrentRevisionType: 'generated', incomingRevisionType: 'imported' })).toEqual({ advancePointer: true });
    expect(decideWorkspacePointer({ pageAdvanced: true, workspaceCurrentRevisionType: null, incomingRevisionType: 'generated' })).toEqual({ advancePointer: true });
    expect(decideWorkspacePointer({ pageAdvanced: true, workspaceCurrentRevisionType: 'manual_edit', incomingRevisionType: 'duplicate' })).toEqual({ advancePointer: true });
  });
});
