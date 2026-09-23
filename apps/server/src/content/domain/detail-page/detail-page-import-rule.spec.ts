import { describe, expect, it } from 'vitest';
import { decideDetailPageImport } from './detail-page-import-rule';

describe('decideDetailPageImport', () => {
  it('상세가 아직 없으면 가져온 HTML 이 현재가 된다', () => {
    expect(decideDetailPageImport({ currentRevisionType: null, lastImportedDigest: null, incomingDigest: 'a' }))
      .toEqual({ kind: 'append', advancePointer: true });
  });

  it('현재가 가져온 것이면 새 가져오기가 현재를 대신한다', () => {
    expect(decideDetailPageImport({ currentRevisionType: 'imported', lastImportedDigest: 'a', incomingDigest: 'b' }))
      .toEqual({ kind: 'append', advancePointer: true });
  });

  it('사람이 고친 revision 이 현재이면 이력에만 쌓고 포인터는 두지 않는다', () => {
    expect(decideDetailPageImport({ currentRevisionType: 'manual_edit', lastImportedDigest: 'a', incomingDigest: 'b' }))
      .toEqual({ kind: 'append', advancePointer: false });
    expect(decideDetailPageImport({ currentRevisionType: 'duplicate', lastImportedDigest: null, incomingDigest: 'b' }))
      .toEqual({ kind: 'append', advancePointer: false });
  });

  it('같은 내용이면 revision 을 만들지 않는다', () => {
    expect(decideDetailPageImport({ currentRevisionType: 'manual_edit', lastImportedDigest: 'a', incomingDigest: 'a' }))
      .toEqual({ kind: 'skip', reason: 'unchanged' });
  });
});
